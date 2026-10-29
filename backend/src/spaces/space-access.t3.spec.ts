import { OrgPlan, RoleCode, RoleScope } from '@prisma/client';
import { AuthorizationService } from '../auth/authorization/authorization.service';
import { CapabilityConfigService } from '../auth/authorization/capability-config.service';
import { Action } from '../auth/authorization/actions';
import { PlanConfigService } from '../subscription/plan-config.service';
import { SpacesService } from './spaces.service';

/** T3: GET /spaces/:id/access — effective capabilities + enforced plan. */
describe('space access (T3)', () => {
  const SPACE = 'space-a';
  const EVENT = 'event-a';
  const user = { id: 'u1' };

  const authz = async (
    roles: Array<{ code: RoleCode; scope: RoleScope; spaceId?: string; eventId?: string }>,
    overrides: Array<{ spaceId: string; code: RoleCode; action: string }> = [],
  ) => {
    const prisma = {
      userCapabilityOverride: { findMany: jest.fn(async () => []) },
      userRole: {
        findMany: jest.fn().mockResolvedValue(
          roles.map((r) => ({ role: { code: r.code, scope: r.scope }, spaceId: r.spaceId ?? null, eventId: r.eventId ?? null })),
        ),
      },
      event: {
        findUnique: jest.fn().mockResolvedValue({ spaceId: SPACE }),
        findMany: jest.fn().mockResolvedValue([
          { id: EVENT, spaceId: SPACE },
          { id: 'event-b', spaceId: 'space-b' },
        ]),
      },
      eventCoHost: { findMany: jest.fn().mockResolvedValue([{ spaceId: 'space-co' }]) },
      roleCapability: { findMany: jest.fn().mockResolvedValue([]) },
      spaceRoleCapability: { findMany: jest.fn().mockResolvedValue(overrides) },
    };
    const caps = new CapabilityConfigService(prisma as any);
    await caps.reload();
    return new AuthorizationService(prisma as any, caps);
  };

  it('event-scoped Co-Curator gets event caps but not money, and no space caps', async () => {
    const svc = await authz([{ code: RoleCode.CO_CURATOR, scope: RoleScope.EVENT, eventId: EVENT }]);
    const a = await svc.accessIn(user, SPACE, EVENT);
    expect(a.spaceRole).toBeNull();
    expect(a.eventRole).toBe(RoleCode.CO_CURATOR);
    expect(a.capabilities).toEqual(
      expect.arrayContaining([Action.EVENT_EDIT, Action.EVENT_CHECK_IN, Action.EVENT_MANAGE_ATTENDEES]),
    );
    expect(a.capabilities).not.toContain(Action.EVENT_MANAGE_MONEY);
    expect(a.capabilities).not.toContain(Action.EVENT_PUBLISH);
    expect(a.capabilities.some((c) => c.startsWith('space:'))).toBe(false);
    // Without eventId: event caps held on some event of this space only.
    expect((await svc.accessIn(user, SPACE)).capabilities).toContain(Action.EVENT_EDIT);
    expect((await svc.accessIn(user, 'space-b')).capabilities).toEqual([]);
  });

  it('reflects a per-space override', async () => {
    const svc = await authz(
      [{ code: RoleCode.CREW, scope: RoleScope.EVENT, eventId: EVENT }],
      [
        { spaceId: SPACE, code: RoleCode.CREW, action: Action.EVENT_VIEW },
        { spaceId: SPACE, code: RoleCode.CREW, action: Action.EVENT_MANAGE_ATTENDEES },
      ],
    );
    const a = await svc.accessIn(user, SPACE, EVENT);
    expect(a.capabilities).toContain(Action.EVENT_MANAGE_ATTENDEES);
    // The override set is authoritative: check-in was not kept.
    expect(a.capabilities).not.toContain(Action.EVENT_CHECK_IN);
  });

  it('Space Admin inherits event caps except money; Platform Admin gets everything', async () => {
    const admin = await authz([{ code: RoleCode.SPACE_ADMIN, scope: RoleScope.SPACE, spaceId: SPACE }]);
    const a = await admin.accessIn(user, SPACE, EVENT);
    expect(a.spaceRole).toBe(RoleCode.SPACE_ADMIN);
    expect(a.capabilities).toEqual(expect.arrayContaining([Action.SPACE_MANAGE_BILLING, Action.EVENT_PUBLISH]));
    expect(a.capabilities).not.toContain(Action.EVENT_MANAGE_MONEY);

    const platform = await authz([{ code: RoleCode.ADMIN, scope: RoleScope.PLATFORM }]);
    expect((await platform.accessIn(user, SPACE, EVENT)).capabilities).toContain(Action.EVENT_MANAGE_MONEY);
  });

  it('co-host Space Admin gets event:edit only (the canManageEvent fallback), never publish/cancel/team/money', async () => {
    const coAdmin = await authz([{ code: RoleCode.SPACE_ADMIN, scope: RoleScope.SPACE, spaceId: 'space-co' }]);
    const a = await coAdmin.accessIn(user, 'space-co', EVENT);
    expect(a.capabilities.filter((c) => c.startsWith('event:'))).toEqual([Action.EVENT_EDIT]);

    // A co-host Curator (not a Space Admin) gets nothing on the event.
    const coCurator = await authz([{ code: RoleCode.CURATOR, scope: RoleScope.SPACE, spaceId: 'space-co' }]);
    expect((await coCurator.accessIn(user, 'space-co', EVENT)).capabilities).not.toContain(Action.EVENT_EDIT);
  });

  it('plan features reflect an expired plan (Starter limits)', async () => {
    const planConfig = new PlanConfigService({} as any);
    const sub = {
      plan: OrgPlan.PRO,
      expiresAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      cancelledAt: null,
      pendingPlan: null,
    };
    const prisma = { orgSubscription: { findUnique: jest.fn().mockResolvedValue(sub) } };
    const svc = new SpacesService(prisma as any, {} as any, {} as any, {} as any, planConfig);
    const plan = await svc.getPlanAccess(SPACE);
    const starter = planConfig.getLimits(OrgPlan.STARTER);
    expect(plan?.status).toBe('EXPIRED');
    expect(plan?.plan).toBe(OrgPlan.PRO);
    expect(plan?.features.hasCertificates).toBe(starter.hasCertificates);
    expect(plan?.features.hasCertificates).not.toBe(planConfig.getLimits(OrgPlan.PRO).hasCertificates);
    expect(plan?.limits.eventsPerMonth).toBe(starter.eventsPerMonth);
    expect(plan?.features).not.toHaveProperty('platformFeePercent');

    prisma.orgSubscription.findUnique.mockResolvedValueOnce(null);
    expect(await svc.getPlanAccess(SPACE)).toBeNull();
  });
});
