import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleCode, RoleScope } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RolesGuard } from '../guards/roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthorizationService } from './authorization.service';
import { CapabilityConfigService } from './capability-config.service';
import { CanGuard } from './can.guard';
import { CAN_ACTION_KEY, CAN_LOCATOR_KEY } from './can.decorator';
import { Action } from './actions';
import { PayoutsController } from '../../payouts/payouts.controller';
import { AddSpaceMemberDto, UpdateSpaceMemberRoleDto } from '../../spaces/dto/space-member.dto';

/** T12: the IAM hardening leftovers (guards, DTOs, money routes, user_roles unique). */

const ctx = (request: object, handler = () => undefined) =>
  ({
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  }) as any;

describe('RolesGuard counts platform rows only (T12)', () => {
  const guard = (rows: object[]) => {
    const prisma = { userRole: { findMany: jest.fn().mockResolvedValue(rows) } };
    const reflector = { getAllAndOverride: () => [RoleCode.ADMIN] } as unknown as Reflector;
    return { guard: new RolesGuard(reflector, prisma as any), prisma };
  };

  it('asks only for rows with no space and no event', async () => {
    const { guard: g, prisma } = guard([{ role: { code: RoleCode.ADMIN } }]);
    await expect(g.canActivate(ctx({ user: { id: 'u1' } }))).resolves.toBe(true);
    expect(prisma.userRole.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', spaceId: null, eventId: null } }),
    );
  });

  it('refuses when no platform row holds the role', async () => {
    const { guard: g } = guard([]);
    await expect(g.canActivate(ctx({ user: { id: 'u1' } }))).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('can() ignores a platform role held on a space or event row (T12)', () => {
  const build = (rows: object[]) => {
    const prisma = {
      userCapabilityOverride: { findMany: jest.fn().mockResolvedValue([]) },
      userRole: { findMany: jest.fn().mockResolvedValue(rows) },
      event: { findUnique: jest.fn().mockResolvedValue({ spaceId: 'sp-1' }) },
    };
    return new AuthorizationService(prisma as any, new CapabilityConfigService(prisma as any));
  };
  const admin = { role: { code: RoleCode.ADMIN, scope: RoleScope.PLATFORM } };

  it('ADMIN on a platform row is still the superuser', async () => {
    const svc = build([{ ...admin, spaceId: null, eventId: null }]);
    expect(await svc.can({ id: 'u1' }, Action.PLATFORM_MANAGE)).toBe(true);
  });

  it('ADMIN on a space or event row grants nothing', async () => {
    const svc = build([
      { ...admin, spaceId: 'sp-1', eventId: null },
      { ...admin, spaceId: null, eventId: 'ev-1' },
    ]);
    expect(await svc.can({ id: 'u1' }, Action.PLATFORM_MANAGE)).toBe(false);
    expect(await svc.can({ id: 'u1' }, Action.SPACE_MANAGE_MONEY, { spaceId: 'sp-1' })).toBe(false);
    expect(await svc.can({ id: 'u1' }, Action.EVENT_MANAGE_MONEY, { eventId: 'ev-1' })).toBe(false);
  });
});

describe('CanGuard with a list of actions (T12)', () => {
  const run = (actions: Action | Action[], locator: object, request: object, allow: (a: Action, r: object) => boolean) => {
    const meta: Record<string, unknown> = { [CAN_ACTION_KEY]: actions, [CAN_LOCATOR_KEY]: locator };
    const reflector = { getAllAndOverride: (key: string) => meta[key] } as unknown as Reflector;
    const authz = {
      can: jest.fn(async (_u: unknown, a: Action, r: object) => allow(a, r)),
      resolveEventSpace: jest.fn(async () => 'sp-1'),
    };
    return { result: new CanGuard(reflector, authz as any).canActivate(ctx({ user: { id: 'u1' }, ...request })), authz };
  };
  const EVENT_MONEY = [Action.EVENT_MANAGE_MONEY, Action.SPACE_MANAGE_MONEY];

  it("passes a Space Admin on the event's owning space", async () => {
    const { result, authz } = run(EVENT_MONEY, {}, { params: { eventId: 'ev-1' } }, (a) => a === Action.SPACE_MANAGE_MONEY);
    await expect(result).resolves.toBe(true);
    expect(authz.resolveEventSpace).toHaveBeenCalledWith('ev-1');
    expect(authz.can).toHaveBeenLastCalledWith({ id: 'u1' }, Action.SPACE_MANAGE_MONEY, { spaceId: 'sp-1' });
  });

  it("passes the event's Curator without a space lookup", async () => {
    const { result, authz } = run(EVENT_MONEY, {}, { params: { eventId: 'ev-1' } }, (a) => a === Action.EVENT_MANAGE_MONEY);
    await expect(result).resolves.toBe(true);
    expect(authz.resolveEventSpace).not.toHaveBeenCalled();
  });

  it('reads the event from the body when told to', async () => {
    const { result, authz } = run(EVENT_MONEY, { source: 'body' }, { body: { eventId: 'ev-1' } }, () => false);
    await expect(result).rejects.toBeInstanceOf(ForbiddenException);
    expect(authz.can).toHaveBeenCalledWith({ id: 'u1' }, Action.EVENT_MANAGE_MONEY, { eventId: 'ev-1' });
  });

  it('refuses a Co-Curator (neither money action)', async () => {
    const { result } = run(EVENT_MONEY, {}, { params: { eventId: 'ev-1' } }, () => false);
    await expect(result).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a single action still reads the space route id', async () => {
    const { result, authz } = run(Action.SPACE_MANAGE_MONEY, {}, { params: { spaceId: 'sp-2' } }, () => true);
    await expect(result).resolves.toBe(true);
    expect(authz.can).toHaveBeenCalledWith({ id: 'u1' }, Action.SPACE_MANAGE_MONEY, { spaceId: 'sp-2' });
    expect(authz.resolveEventSpace).not.toHaveBeenCalled();
  });
});

describe('payouts money routes carry @Can (T12)', () => {
  const action = (method: keyof PayoutsController) =>
    Reflect.getMetadata(CAN_ACTION_KEY, PayoutsController.prototype[method]);
  const EVENT_MONEY = [Action.EVENT_MANAGE_MONEY, Action.SPACE_MANAGE_MONEY];

  it.each([
    ['getEventPayoutSummary', EVENT_MONEY],
    ['getEligibleAccounts', EVENT_MONEY],
    ['setEventPayoutAccount', EVENT_MONEY],
    ['requestPayout', EVENT_MONEY],
    ['getSpacePayouts', Action.SPACE_MANAGE_MONEY],
    ['getSpaceFinancials', Action.SPACE_MANAGE_MONEY],
  ] as const)('%s', (method, expected) => {
    expect(action(method)).toEqual(expected);
  });

  it('the payout request reads its event from the body', () => {
    expect(Reflect.getMetadata(CAN_LOCATOR_KEY, PayoutsController.prototype.requestPayout)).toEqual({ source: 'body' });
  });

  it('the class runs CanGuard', () => {
    expect(Reflect.getMetadata('__guards__', PayoutsController)).toContain(CanGuard);
  });

  it('admin routes keep @Roles(ADMIN)', () => {
    expect(Reflect.getMetadata(ROLES_KEY, PayoutsController.prototype.processPayout)).toEqual([RoleCode.ADMIN]);
  });
});

describe('space-member DTOs take space roles only (T12)', () => {
  const errors = async (cls: new () => object, body: object) =>
    (await validate(plainToInstance(cls, body))).map((e) => e.property);

  it.each([RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.CURATOR])('rejects %s', async (role) => {
    expect(await errors(AddSpaceMemberDto, { userId: '0b5e4a7e-6f4c-4b8e-9a43-3c8f0f9b2d11', role })).toEqual(['role']);
    expect(await errors(UpdateSpaceMemberRoleDto, { role })).toEqual(['role']);
  });

  it.each([RoleCode.SPACE_ADMIN, RoleCode.MEMBER])('accepts %s', async (role) => {
    expect(await errors(AddSpaceMemberDto, { email: 'a@b.co', role })).toEqual([]);
    expect(await errors(UpdateSpaceMemberRoleDto, { role })).toEqual([]);
  });
});

describe('20261203120000_user_roles_nulls_not_distinct', () => {
  const sql = readFileSync(
    join(__dirname, '../../../prisma/migrations/20261203120000_user_roles_nulls_not_distinct/migration.sql'),
    'utf8',
  );
  const code = sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();

  it('is a marked contract step', () => {
    expect(sql).toMatch(/^-- contract-step\b/m);
  });

  it('dedupes on all four columns, NULLs equal, keeping the oldest row', () => {
    expect(code).toContain(
      'DELETE FROM "user_roles" d USING "user_roles" k WHERE d.user_id = k.user_id AND d.role_id = k.role_id AND d.space_id IS NOT DISTINCT FROM k.space_id AND d.event_id IS NOT DISTINCT FROM k.event_id AND (k.created_at, k.id) < (d.created_at, d.id);',
    );
  });

  it('dedupes before it builds the NULLS NOT DISTINCT unique', () => {
    const unique =
      'CREATE UNIQUE INDEX "user_roles_user_id_role_id_space_id_event_id_key" ON "user_roles"("user_id", "role_id", "space_id", "event_id") NULLS NOT DISTINCT;';
    expect(code).toContain(unique);
    expect(code.indexOf('DELETE FROM')).toBeLessThan(code.indexOf(unique));
  });

  it("drops init's 3-column unique (the pinned drift)", () => {
    expect(code).toContain('DROP INDEX IF EXISTS "user_roles_user_id_role_id_space_id_key";');
  });
});
