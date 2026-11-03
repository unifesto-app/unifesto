import { RoleCode, RoleScope } from '@prisma/client';
import { CheckinService } from './checkin.service';
import { AuthorizationService, CapabilityConfigService } from '../auth/authorization';

/**
 * T2: the mobile check-in list comes from the scan's own rule (`can()` with
 * `event:check-in`), so every role gets exactly the events it can scan at.
 * Real AuthorizationService and compiled matrix; Prisma is faked.
 */
describe('CheckinService.getMyCheckinEvents (T2)', () => {
  const EVENTS = [
    { id: 'ev-a1', spaceId: 'space-a' },
    { id: 'ev-a2', spaceId: 'space-a' },
    { id: 'ev-b1', spaceId: 'space-b' },
  ];

  const role = (code: RoleCode, scope: RoleScope, spaceId: string | null, eventId: string | null) => ({
    role: { code, scope },
    spaceId,
    eventId,
  });

  const ROLES: Record<string, ReturnType<typeof role>[]> = {
    spaceAdmin: [role(RoleCode.SPACE_ADMIN, RoleScope.SPACE, 'space-a', null)],
    curator: [role(RoleCode.CURATOR, RoleScope.EVENT, 'space-a', 'ev-a1')],
    coCurator: [role(RoleCode.CO_CURATOR, RoleScope.EVENT, 'space-a', 'ev-a2')],
    crew: [role(RoleCode.CREW, RoleScope.EVENT, 'space-b', 'ev-b1')],
    platformAdmin: [role(RoleCode.ADMIN, RoleScope.PLATFORM, null, null)],
    member: [role(RoleCode.MEMBER, RoleScope.SPACE, 'space-a', null)],
    stranger: [],
  };

  // Honours the id / spaceId narrowing the services ask for; every fixture is live.
  const matches = (e: Record<string, unknown>, w: any): boolean =>
    Object.entries(w ?? {}).every(([k, v]: [string, any]) =>
      k === 'AND'
        ? v.every((x: any) => matches(e, x))
        : k === 'OR'
          ? v.some((x: any) => matches(e, x))
          : k === 'id' || k === 'spaceId'
            ? !v?.in || v.in.includes(e[k])
            : true,
    );

  const prisma: any = {
    userRole: { findMany: jest.fn(async ({ where }) => ROLES[where.userId]) },
    userCapabilityOverride: { findMany: jest.fn(async () => []) },
    eventCheckinAccess: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
    },
    event: {
      findUnique: jest.fn(async ({ where }) => EVENTS.find((e) => e.id === where.id) ?? null),
      findMany: jest.fn(async ({ where }) =>
        EVENTS.filter((e) => matches(e, where)).map((e) => ({
          ...e,
          title: e.id,
          endDateTime: new Date(Date.now() + 3_600_000),
          checkinTypes: [{ id: `${e.id}-entry`, name: 'Entry' }],
        })),
      ),
    },
  };
  const authz = new AuthorizationService(prisma, new CapabilityConfigService(prisma));
  const svc = new CheckinService(prisma, {} as any, authz);

  it.each([
    ['spaceAdmin', ['ev-a1', 'ev-a2']],
    ['curator', ['ev-a1']],
    ['coCurator', ['ev-a2']],
    ['crew', ['ev-b1']],
    ['platformAdmin', ['ev-a1', 'ev-a2', 'ev-b1']],
    ['member', []],
    ['stranger', []],
  ])('%s lists exactly the events it can scan at', async (user, expected) => {
    const { events } = await svc.getMyCheckinEvents(user);
    expect(events.map((e) => e.id).sort()).toEqual(expected);

    for (const e of EVENTS) {
      const scans = await svc.canCheckinAtType(user, e.spaceId, e.id, `${e.id}-entry`);
      expect(scans).toBe(expected.includes(e.id));
    }
    // Listed with every point, as the scan allows every point.
    for (const e of events) expect(e.checkinTypes).toEqual([{ id: `${e.id}-entry`, name: 'Entry' }]);
  });
});
