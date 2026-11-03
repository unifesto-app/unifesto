import { ForbiddenException } from '@nestjs/common';
import { Action } from '../auth/authorization';
import { CheckinService } from '../checkin/checkin.service';
import { PlanConfigService } from '../subscription/plan-config.service';
import { buildRegistrationsService } from '../registrations/registrations.testing';
import { PayoutsService } from './payouts.service';

/**
 * T12: money stays with the D9 pair (the event's Curator via event:manage-money,
 * or a Space Admin of its space via space:manage-money). Co-Curator and Crew,
 * who may hold event:manage-attendees / event:check-in, get no money columns.
 */

const event = {
  id: 'ev-1',
  title: 'Fest',
  slug: 'fest',
  spaceId: 'sp-1',
  space: { subscription: { plan: 'STARTER' } },
};
/** An authz fake that grants exactly `held`, and records what it was asked. */
const authzHolding = (...held: Action[]) => ({
  can: jest.fn(async (_u: unknown, a: Action) => held.includes(a)),
});

describe('transactions export (T12)', () => {
  const build = (authz: object) => {
    const prisma: any = {
      event: { findUnique: jest.fn(async () => event) },
      eventRegistration: { findMany: jest.fn(async () => []) },
      eventFormField: { findMany: jest.fn(async () => []) },
    };
    const planConfig = {
      getEffectiveLimits: jest.fn(() => ({ hasBulkExport: true })),
      resolvePlatformFeePercent: jest.fn(() => 0),
    };
    return buildRegistrationsService(
      prisma, {} as any, {} as any, {} as any, planConfig as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, authz as any,
    );
  };

  it('refuses a Co-Curator (attendees but no money)', async () => {
    const svc = build(authzHolding(Action.EVENT_MANAGE_ATTENDEES));
    await expect(svc.exportRegistrations('co', 'ev-1', 'csv', 'transactions')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('still lets a Co-Curator export attendees', async () => {
    const svc = build(authzHolding(Action.EVENT_MANAGE_ATTENDEES));
    await expect(svc.exportRegistrations('co', 'ev-1', 'csv', 'attendees')).resolves.toBeDefined();
  });

  it("lets the Curator (event money) export transactions", async () => {
    const svc = build(authzHolding(Action.EVENT_MANAGE_ATTENDEES, Action.EVENT_MANAGE_MONEY));
    await expect(svc.exportRegistrations('cur', 'ev-1', 'csv', 'transactions')).resolves.toBeDefined();
  });

  it("lets a Space Admin (the space's money) export transactions", async () => {
    const authz = authzHolding(Action.EVENT_MANAGE_ATTENDEES, Action.SPACE_MANAGE_MONEY);
    const svc = build(authz);
    await expect(svc.exportRegistrations('sa', 'ev-1', 'csv', 'transactions')).resolves.toBeDefined();
    expect(authz.can).toHaveBeenCalledWith({ id: 'sa' }, Action.SPACE_MANAGE_MONEY, { spaceId: 'sp-1' });
  });
});

describe('transactions tiles (T12)', () => {
  const build = (authz: object) => {
    const db: any = {
      event: { findUnique: jest.fn(async () => event) },
      eventRegistration: { findMany: jest.fn(async () => []) },
    };
    return new PayoutsService(db, {} as any, authz as any, new PlanConfigService({} as any));
  };

  it('refuses a Co-Curator', async () => {
    await expect(build(authzHolding(Action.EVENT_MANAGE_ATTENDEES)).getEventTransactions('co', 'ev-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it.each([Action.EVENT_MANAGE_MONEY, Action.SPACE_MANAGE_MONEY])('allows %s', async (action) => {
    await expect(build(authzHolding(action)).getEventTransactions('u', 'ev-1')).resolves.toMatchObject({ count: 0 });
  });
});

describe('GET /checkin/event/:id is a check-in projection (T12)', () => {
  it('selects no form answers, payment ids, amounts or ticket codes', async () => {
    const findMany = jest.fn(async () => [{ id: 'r1', checkedInAt: new Date() }]);
    const db: any = {
      event: { findUnique: jest.fn(async () => event) },
      eventRegistration: { findMany },
    };
    const svc = new CheckinService(db, {} as any, {} as any);
    jest.spyOn(svc, 'canManageCheckin').mockResolvedValue(true);

    const out = await svc.getEventRegistrationsForOffline('crew', 'ev-1');
    expect(out).toMatchObject({ eventId: 'ev-1', totalCount: 1, checkedInCount: 1 });

    const args = (findMany.mock.calls[0] as unknown[])[0] as { select: Record<string, unknown>; include?: unknown };
    expect(args.include).toBeUndefined();
    expect(Object.keys(args.select).sort()).toEqual(
      ['checkedInAt', 'checkedInByUser', 'checkinRecords', 'id', 'status', 'ticketType', 'user'].sort(),
    );
    expect(args.select.ticketType).toEqual({ select: { id: true, name: true } });
  });
});
