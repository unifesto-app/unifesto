import { ForbiddenException } from '@nestjs/common';
import { RoleCode, RoleScope } from '@prisma/client';
import { Action } from './authorization/actions';
import { AuthorizationService } from './authorization/authorization.service';
import { CapabilityConfigService } from './authorization/capability-config.service';
import { assertNotSuspended, isSuspended } from './suspension';

/** F4: suspension windows and per-user capability overrides. */
describe('suspension (F4)', () => {
  const day = 86_400_000;
  it('suspends until the end date, bans without one, and lapses after', () => {
    expect(isSuspended({ suspendedAt: null, suspendedUntil: null })).toBe(false);
    expect(isSuspended({ suspendedAt: new Date(), suspendedUntil: null })).toBe(true);
    expect(isSuspended({ suspendedAt: new Date(), suspendedUntil: new Date(Date.now() + day) })).toBe(true);
    expect(isSuspended({ suspendedAt: new Date(), suspendedUntil: new Date(Date.now() - day) })).toBe(false);
    expect(() => assertNotSuspended({ suspendedAt: new Date(), suspendedUntil: null })).toThrow(ForbiddenException);
  });
});

describe('per-user capability overrides (F4)', () => {
  const build = (
    roles: { code: RoleCode; scope: RoleScope; spaceId: string | null }[],
    overrides: { action: string; allow: boolean; spaceId: string | null }[],
  ) => {
    const prisma = {
      userCapabilityOverride: { findMany: jest.fn().mockResolvedValue(overrides) },
      userRole: {
        findMany: jest.fn().mockResolvedValue(roles.map((r) => ({ ...r, eventId: null, role: r }))),
      },
      event: { findUnique: jest.fn().mockResolvedValue({ spaceId: 'sp-a' }) },
    };
    return new AuthorizationService(prisma as any, new CapabilityConfigService(prisma as any));
  };
  const admin = { code: RoleCode.SPACE_ADMIN, scope: RoleScope.SPACE, spaceId: 'sp-a' };
  const u = { id: 'u1' };

  it('a denial beats the role, everywhere or in its one space', async () => {
    const everywhere = build([admin], [{ action: Action.SPACE_MANAGE_MONEY, allow: false, spaceId: null }]);
    expect(await everywhere.can(u, Action.SPACE_MANAGE_MONEY, { spaceId: 'sp-a' })).toBe(false);
    expect(await everywhere.can(u, Action.SPACE_MANAGE_MEMBERS, { spaceId: 'sp-a' })).toBe(true);

    const elsewhere = build([admin], [{ action: Action.EVENT_EDIT, allow: false, spaceId: 'sp-b' }]);
    expect(await elsewhere.can(u, Action.EVENT_EDIT, { eventId: 'ev-in-a' })).toBe(true);
    const here = build([admin], [{ action: Action.EVENT_EDIT, allow: false, spaceId: 'sp-a' }]);
    expect(await here.can(u, Action.EVENT_EDIT, { eventId: 'ev-in-a' })).toBe(false);
  });

  it('a grant works in its space only, and a denial still wins', async () => {
    const svc = build([], [{ action: Action.EVENT_CHECK_IN, allow: true, spaceId: 'sp-a' }]);
    expect(await svc.can(u, Action.EVENT_CHECK_IN, { eventId: 'ev-in-a' })).toBe(true);
    expect(await svc.can(u, Action.SPACE_MANAGE_MONEY, { spaceId: 'sp-a' })).toBe(false);
    expect((await svc.accessIn(u, 'sp-a')).capabilities).toEqual([Action.EVENT_CHECK_IN]);

    const both = build([], [
      { action: Action.EVENT_CHECK_IN, allow: true, spaceId: 'sp-a' },
      { action: Action.EVENT_CHECK_IN, allow: false, spaceId: null },
    ]);
    expect(await both.can(u, Action.EVENT_CHECK_IN, { eventId: 'ev-in-a' })).toBe(false);
  });
});
