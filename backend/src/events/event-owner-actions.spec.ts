import { PlanConfigService } from '../subscription/plan-config.service';
import { PLAN_LIMITS } from '../subscription/plan-limits.config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RoleCode, RoleScope } from '@prisma/client';
import { AuthorizationService, CAPABILITIES } from '../auth/authorization';
import { EventTeamRole } from './dto';
import { EventsService } from './events.service';

/**
 * T1: publish / cancel / hide / restore / delete need EVENT_PUBLISH or
 * EVENT_CANCEL, and team edits need EVENT_ASSIGN_CREW with rank rules, all
 * checked through the real AuthorizationService (capability matrix and
 * inheritance), one block per role. A co-host Space Admin gets none of it.
 */

const SCOPE: Partial<Record<RoleCode, RoleScope>> = {
  [RoleCode.ADMIN]: RoleScope.PLATFORM,
  [RoleCode.SPACE_ADMIN]: RoleScope.SPACE,
  [RoleCode.MEMBER]: RoleScope.SPACE,
  [RoleCode.CURATOR]: RoleScope.EVENT,
  [RoleCode.CO_CURATOR]: RoleScope.EVENT,
  [RoleCode.CREW]: RoleScope.EVENT,
};

type Row = { userId: string; code: RoleCode; spaceId: string | null; eventId: string | null };

function build(opts: { event?: Record<string, unknown>; plan?: string } = {}) {
  const rows: Row[] = [
    { userId: 'padmin', code: RoleCode.ADMIN, spaceId: null, eventId: null },
    { userId: 'sadmin', code: RoleCode.SPACE_ADMIN, spaceId: 'sp-1', eventId: null },
    { userId: 'cohost', code: RoleCode.SPACE_ADMIN, spaceId: 'sp-2', eventId: null },
    { userId: 'curator', code: RoleCode.MEMBER, spaceId: 'sp-1', eventId: null },
    { userId: 'curator', code: RoleCode.CURATOR, spaceId: null, eventId: 'ev-1' },
    { userId: 'curator2', code: RoleCode.MEMBER, spaceId: 'sp-1', eventId: null },
    { userId: 'curator2', code: RoleCode.CURATOR, spaceId: null, eventId: 'ev-1' },
    { userId: 'cocur', code: RoleCode.MEMBER, spaceId: 'sp-1', eventId: null },
    { userId: 'cocur', code: RoleCode.CO_CURATOR, spaceId: null, eventId: 'ev-1' },
    { userId: 'crew', code: RoleCode.MEMBER, spaceId: 'sp-1', eventId: null },
    { userId: 'crew', code: RoleCode.CREW, spaceId: null, eventId: 'ev-1' },
    { userId: 'member', code: RoleCode.MEMBER, spaceId: 'sp-1', eventId: null },
  ];
  const shaped = (r: Row) => ({ ...r, role: { code: r.code, scope: SCOPE[r.code] } });
  const event = {
    id: 'ev-1',
    spaceId: 'sp-1',
    slug: 'fest',
    title: 'Fest',
    status: 'PUBLISHED',
    deletedAt: null,
    parentEventId: null,
    ...opts.event,
  };
  const prisma: any = {
    event: {
      findUnique: jest.fn(async () => event),
      updateMany: jest.fn(async () => ({ count: 0 })),
      update: jest.fn(async () => event),
    },
    userCapabilityOverride: { findMany: jest.fn(async () => []) },
    userRole: {
      findMany: jest.fn(async ({ where }: any) => rows.filter((r) => r.userId === where.userId).map(shaped)),
      findFirst: jest.fn(async ({ where }: any) => {
        const r = rows.find((x) => x.eventId === where.eventId && x.userId === where.userId);
        return r ? shaped(r) : null;
      }),
      count: jest.fn(async ({ where }: any) =>
        where.spaceId
          ? rows.filter((r) => r.userId === where.userId && r.spaceId === where.spaceId).length
          : rows.filter((r) => r.eventId === where.eventId && r.userId !== where.userId.not && r.code === where.role.code)
              .length,
      ),
      deleteMany: jest.fn(async () => ({ count: 1 })),
      create: jest.fn(async () => ({})),
    },
    eventCheckinAccess: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    role: { findFirst: jest.fn(async () => ({ id: 'role-id' })) },
    eventCoHost: { findMany: jest.fn(async () => [{ spaceId: 'sp-2' }]) },
    // Co-curators per event come from the space's plan (T9); Growth allows 10.
    orgSubscription: { findUnique: jest.fn(async () => ({ plan: opts.plan ?? 'GROWTH' })) },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  };
  const capabilities: any = {
    effectiveHas: (_s: string | null, code: RoleCode, action: string) =>
      (CAPABILITIES[code] ?? []).includes(action as any),
  };
  const authz = new AuthorizationService(prisma, capabilities);
  const cache: any = { invalidateEventCache: jest.fn(async () => undefined) };
  const svc = new EventsService(
    prisma, {} as any, {} as any, cache, {} as any, new PlanConfigService(prisma), { emit: jest.fn() } as any, authz, {} as any,
  );
  const audit = jest.spyOn((svc as any).logger, 'log').mockImplementation(() => undefined);
  return { svc, prisma, audit };
}

/** Owner actions, each run on an event state that fails a business rule right after the permission check. */
const OWNER_ACTIONS: [string, (svc: EventsService, u: string) => Promise<unknown>, Record<string, unknown>?][] = [
  ['publish', (svc, u) => svc.publishEvent(u, 'ev-1')],
  ['cancel', (svc, u) => svc.cancelEvent(u, 'ev-1', { reason: 'x' } as any)],
  ['hide', (svc, u) => svc.softDeleteEvent(u, 'ev-1')],
  ['delete', (svc, u) => svc.permanentDeleteEvent(u, 'ev-1')],
  ['restore', (svc, u) => svc.restoreEvent(u, 'ev-1'), { deletedAt: new Date() }],
];

async function expectAllowed(p: Promise<unknown>) {
  // Past the gate: either it succeeds or a later business rule refuses it.
  await p.catch((err) => {
    expect(err).not.toBeInstanceOf(ForbiddenException);
    expect(err).toBeInstanceOf(BadRequestException);
  });
}

const ROLES: [string, boolean][] = [
  ['padmin', true],
  ['sadmin', true],
  ['curator', true],
  ['cocur', false],
  ['crew', false],
  ['cohost', false],
  ['member', false],
];

describe('owner actions need EVENT_PUBLISH / EVENT_CANCEL (T1)', () => {
  for (const [user, allowed] of ROLES) {
    describe(user, () => {
      for (const [name, run, event] of OWNER_ACTIONS) {
        it(`${allowed ? 'may' : 'may not'} ${name}`, async () => {
          const { svc } = build({ event });
          if (allowed) await expectAllowed(run(svc, user));
          else await expect(run(svc, user)).rejects.toBeInstanceOf(ForbiddenException);
        });
      }
    });
  }
});

describe('team edits (T1)', () => {
  const add = (svc: EventsService, by: string, target: string, role: EventTeamRole) =>
    svc.addTeamMember(by, 'ev-1', target, role);

  describe('Platform ADMIN', () => {
    it('may grant CURATOR, and the grant is audit-logged', async () => {
      const { svc, prisma, audit } = build();
      await expect(add(svc, 'padmin', 'member', EventTeamRole.CURATOR)).resolves.toEqual({ success: true });
      expect(prisma.userRole.create).toHaveBeenCalled();
      expect(audit).toHaveBeenCalledWith(expect.stringContaining('event role grant: event=ev-1 target=member role=CURATOR'));
    });
  });

  describe('Space Admin of the owning space', () => {
    it('may grant CURATOR and remove a Curator', async () => {
      const { svc } = build();
      await expect(add(svc, 'sadmin', 'member', EventTeamRole.CURATOR)).resolves.toEqual({ success: true });
      await expect(svc.removeTeamMember('sadmin', 'ev-1', 'curator')).resolves.toEqual({ success: true });
    });

    it('may not add someone outside the space', async () => {
      const { svc } = build();
      await expect(add(svc, 'sadmin', 'stranger', EventTeamRole.CREW)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('Curator', () => {
    it('may add a Co-Curator or Crew', async () => {
      const { svc } = build();
      await expect(add(svc, 'curator', 'member', EventTeamRole.CO_CURATOR)).resolves.toEqual({ success: true });
      await expect(add(svc, 'curator', 'member', EventTeamRole.CREW)).resolves.toEqual({ success: true });
    });

    it('may not grant CURATOR, touch another Curator, or change their own role', async () => {
      const { svc, prisma } = build();
      await expect(add(svc, 'curator', 'member', EventTeamRole.CURATOR)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.removeTeamMember('curator', 'ev-1', 'curator2')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(add(svc, 'curator', 'curator', EventTeamRole.CREW)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.userRole.create).not.toHaveBeenCalled();
    });

    it("is held to the plan's co-curators per event (T9)", async () => {
      // A General plan set to 1 co-curator, and 'cocur' already holds it.
      const { svc, prisma } = build({ plan: 'STARTER' });
      const planConfig: PlanConfigService = (svc as any).planConfig;
      const limits = planConfig.getLimits('STARTER');
      jest.spyOn(planConfig, 'getLimits').mockImplementation((p) => (p === 'STARTER' ? { ...limits, coCurators: 1 } : PLAN_LIMITS[p]));
      await expect(add(svc, 'curator', 'member', EventTeamRole.CO_CURATOR)).rejects.toThrow(
        'The General plan allows 1 co-curator per event. Club allows more.',
      );
      expect(prisma.userRole.create).not.toHaveBeenCalled();
    });
  });

  describe('Co-Curator', () => {
    it('may add Crew', async () => {
      const { svc } = build();
      await expect(add(svc, 'cocur', 'member', EventTeamRole.CREW)).resolves.toEqual({ success: true });
    });

    it('may not self-promote, grant CO_CURATOR or CURATOR, or remove the Curator', async () => {
      const { svc, prisma } = build();
      await expect(add(svc, 'cocur', 'cocur', EventTeamRole.CURATOR)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(add(svc, 'cocur', 'member', EventTeamRole.CURATOR)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(add(svc, 'cocur', 'member', EventTeamRole.CO_CURATOR)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.removeTeamMember('cocur', 'ev-1', 'curator')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.userRole.create).not.toHaveBeenCalled();
      expect(prisma.userRole.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('Crew', () => {
    it('may not edit the team', async () => {
      const { svc } = build();
      await expect(add(svc, 'crew', 'member', EventTeamRole.CREW)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('Space Admin of a co-host space', () => {
    it('may not edit the team (no co-host fallback)', async () => {
      const { svc } = build();
      await expect(add(svc, 'cohost', 'cohost', EventTeamRole.CURATOR)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.removeTeamMember('cohost', 'ev-1', 'curator')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
