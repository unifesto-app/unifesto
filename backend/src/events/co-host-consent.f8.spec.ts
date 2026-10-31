import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoleCode, RoleScope } from '@prisma/client';
import { AuthorizationService, CAPABILITIES } from '../auth/authorization';
import { PlanConfigService } from '../subscription/plan-config.service';
import { EventsService } from './events.service';

/**
 * F8: inviting a co-host makes a pending link that grants nothing until a
 * Space Admin of the invited space accepts it.
 */
function build() {
  const rows = [
    { userId: 'host', code: RoleCode.SPACE_ADMIN, scope: RoleScope.SPACE, spaceId: 'sp-1' },
    { userId: 'target', code: RoleCode.SPACE_ADMIN, scope: RoleScope.SPACE, spaceId: 'sp-2' },
    { userId: 'member', code: RoleCode.MEMBER, scope: RoleScope.SPACE, spaceId: 'sp-2' },
  ];
  const links: { id: string; eventId: string; spaceId: string; acceptedAt: Date | null }[] = [];
  const match = (l: (typeof links)[number], w: any) =>
    (!w.eventId || l.eventId === w.eventId) &&
    (!w.spaceId || l.spaceId === w.spaceId) &&
    (w.acceptedAt === undefined || (w.acceptedAt === null ? !l.acceptedAt : !!l.acceptedAt));
  const prisma: any = {
    event: {
      findUnique: jest.fn(async () => ({
        id: 'ev-1', slug: 'fest', title: 'Fest', spaceId: 'sp-1', space: { name: 'Host' },
      })),
    },
    space: { findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, name: 'Target' })) },
    userRole: {
      findMany: jest.fn(async ({ where }: any) =>
        rows
          .filter((r) => r.userId === where.userId)
          .map((r) => ({ ...r, eventId: null, role: { code: r.code, scope: r.scope } })),
      ),
    },
    userCapabilityOverride: { findMany: jest.fn(async () => []) },
    eventCoHost: {
      findUnique: jest.fn(async ({ where }: any) => {
        const l = links.find((x) => match(x, where.eventId_spaceId));
        return l ? { ...l, event: { slug: 'fest' } } : null;
      }),
      findMany: jest.fn(async ({ where }: any) => links.filter((l) => match(l, where))),
      create: jest.fn(async ({ data }: any) => {
        const l = { id: `l-${links.length}`, acceptedAt: null, ...data };
        links.push(l);
        return l;
      }),
      update: jest.fn(async ({ where, data }: any) => Object.assign(links.find((l) => l.id === where.id)!, data)),
    },
  };
  const capabilities: any = {
    effectiveHas: (_s: string | null, code: RoleCode, action: string) =>
      (CAPABILITIES[code] ?? []).includes(action as any),
  };
  const authz = new AuthorizationService(prisma, capabilities);
  const cache: any = { invalidateEventCache: jest.fn(async () => undefined) };
  const svc = new EventsService(
    prisma, {} as any, {} as any, cache, {} as any, new PlanConfigService(prisma), { emit: jest.fn() } as any, authz,
  );
  return { svc, links, cache };
}

describe('co-host consent (F8)', () => {
  it('a pending invite grants the invited space nothing until it accepts', async () => {
    const { svc, links, cache } = build();
    await svc.addCoHost('host', 'ev-1', 'sp-2');
    expect(links).toHaveLength(1);
    expect(links[0].acceptedAt).toBeNull();
    expect(await svc.canManageEvent('target', 'sp-1', 'ev-1')).toBe(false);

    await svc.acceptCoHost('target', 'ev-1', 'sp-2');
    expect(links[0].acceptedAt).toBeInstanceOf(Date);
    expect(cache.invalidateEventCache).toHaveBeenCalledWith('fest');
    expect(await svc.canManageEvent('target', 'sp-1', 'ev-1')).toBe(true);
  });

  it('only a Space Admin of the invited space may accept, and only once', async () => {
    const { svc } = build();
    await svc.addCoHost('host', 'ev-1', 'sp-2');
    await expect(svc.acceptCoHost('member', 'ev-1', 'sp-2')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.acceptCoHost('host', 'ev-1', 'sp-2')).rejects.toBeInstanceOf(ForbiddenException);
    await svc.acceptCoHost('target', 'ev-1', 'sp-2');
    await expect(svc.acceptCoHost('target', 'ev-1', 'sp-2')).rejects.toBeInstanceOf(NotFoundException);
  });
});
