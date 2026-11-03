import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Action } from '../auth/authorization';
import { CheckinService } from '../checkin/checkin.service';
import { PlanConfigService } from '../subscription/plan-config.service';
import { buildRegistrationsService } from '../registrations/registrations.testing';
import { REGISTRATION_MONEY_FIELDS } from '../registrations/registration-attendees.service';
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

describe('attendee list money fields (T12 follow-up)', () => {
  const row = {
    id: 'r1',
    status: 'REGISTERED',
    paymentStatus: 'PAID',
    paidAt: new Date(),
    formResponses: { f1: 'Yes' },
    totalAmount: 102,
    couponDiscount: 0,
    razorpayAmount: 102,
    processingFee: 2,
    refundedAmount: 0,
    platformFeePercent: 5,
    dealId: 'deal-1',
    refundDueAt: null,
    paymentId: 'pay_1',
    orderId: 'order_1',
    paymentLinkId: 'plink_1',
    user: { id: 'u1', fullName: 'A', identities: [{ email: 'a@x.in' }] },
    ticketType: { id: 't1', name: 'GA' },
    tickets: [],
  };
  const list = async (authz: object) => {
    const prisma: any = {
      event: { findUnique: jest.fn(async () => event) },
      eventRegistration: { findMany: jest.fn(async () => [row]), count: jest.fn(async () => 1) },
    };
    const svc = buildRegistrationsService(
      prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, authz as any,
    );
    return (await svc.getEventRegistrations('u', 'ev-1')).registrations[0] as Record<string, unknown>;
  };

  it('a Co-Curator gets the row without payment ids, amounts, fees or refund figures', async () => {
    const reg = await list(authzHolding(Action.EVENT_MANAGE_ATTENDEES));
    for (const key of REGISTRATION_MONEY_FIELDS) expect(reg).not.toHaveProperty(key);
    expect(reg).toMatchObject({ id: 'r1', paymentStatus: 'PAID', formResponses: { f1: 'Yes' }, user: { email: 'a@x.in' } });
  });

  it('the Curator (event money) keeps them', async () => {
    const reg = await list(authzHolding(Action.EVENT_MANAGE_ATTENDEES, Action.EVENT_MANAGE_MONEY));
    expect(reg).toMatchObject({ totalAmount: 102, processingFee: 2, paymentId: 'pay_1', orderId: 'order_1' });
  });

  it("a Space Admin keeps them, checked on the event's space", async () => {
    const authz = authzHolding(Action.EVENT_MANAGE_ATTENDEES, Action.SPACE_MANAGE_MONEY);
    const reg = await list(authz);
    expect(reg).toMatchObject({ totalAmount: 102, paymentId: 'pay_1' });
    expect(authz.can).toHaveBeenCalledWith({ id: 'u' }, Action.SPACE_MANAGE_MONEY, { spaceId: 'sp-1' });
  });

  it('every Decimal column on EventRegistration is stripped (a new amount column must be added)', () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'EventRegistration')!;
    const decimals = model.fields.filter((f) => f.type === 'Decimal').map((f) => f.name);
    expect(REGISTRATION_MONEY_FIELDS).toEqual(expect.arrayContaining(decimals));
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
