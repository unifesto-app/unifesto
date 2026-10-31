import * as crypto from 'crypto';
import { addBillingCycle, prorationCreditPaise, SubscriptionService } from './subscription.service';
import { PlanConfigService, subscriptionStatus } from './plan-config.service';
import { SubscriptionSchedulerService } from './subscription-scheduler.service';
import { pricedPlanConfig, rateCardTerms } from './terms.testing';

const DAY = 86400000;

describe('subscriptionStatus (T8)', () => {
  const end = new Date('2027-03-01T00:00:00Z');
  const pro = { plan: 'PRO' as const, expiresAt: end, cancelledAt: null };
  const at = (ms: number) => new Date(end.getTime() + ms);

  it('is ACTIVE before expiresAt', () => {
    expect(subscriptionStatus(pro, at(-1))).toBe('ACTIVE');
  });
  it('is GRACE from expiresAt to 7 days after (exclusive)', () => {
    expect(subscriptionStatus(pro, at(0))).toBe('GRACE');
    expect(subscriptionStatus(pro, at(7 * DAY - 1))).toBe('GRACE');
  });
  it('is EXPIRED at exactly 7 days after', () => {
    expect(subscriptionStatus(pro, at(7 * DAY))).toBe('EXPIRED');
  });
  it('a cancelled plan gets no grace', () => {
    expect(subscriptionStatus({ ...pro, cancelledAt: new Date() }, at(0))).toBe('EXPIRED');
  });
  it('Starter and undated plans never expire', () => {
    expect(subscriptionStatus({ ...pro, plan: 'STARTER' }, at(30 * DAY))).toBe('ACTIVE');
    expect(subscriptionStatus({ ...pro, expiresAt: null }, at(30 * DAY))).toBe('ACTIVE');
  });
  it('an expired plan gets Starter limits; grace keeps its own', () => {
    const cfg = new PlanConfigService({} as any);
    const sub = { ...pro };
    jest.useFakeTimers().setSystemTime(at(3 * DAY));
    expect(cfg.getEffectiveLimits(sub)).toEqual(cfg.getLimits('PRO'));
    jest.setSystemTime(at(8 * DAY));
    expect(cfg.getEffectiveLimits(sub)).toEqual(cfg.getLimits('STARTER'));
    jest.useRealTimers();
  });
});

describe('prorationCreditPaise', () => {
  it('bought 31 Jan (ends 28 Feb), 14 of 28 days left: half the price', () => {
    expect(
      prorationCreditPaise(
        49900,
        'MONTHLY',
        new Date('2027-02-28T04:30:00Z'),
        new Date('2027-02-14T04:30:00Z'),
        new Date('2027-01-31T04:30:00Z'),
      ),
    ).toBe(24950);
  });
  it('mid-cycle annual: 183 of 365 days left, floored to the paisa', () => {
    expect(
      prorationCreditPaise(449900, 'ANNUAL', new Date('2027-10-18T04:30:00Z'), new Date('2027-04-18T04:30:00Z')),
    ).toBe(Math.floor((449900 * 183) / 365));
  });
  it('nothing left, nothing credited', () => {
    expect(prorationCreditPaise(49900, 'MONTHLY', new Date('2027-01-01'), new Date('2027-01-02'))).toBe(0);
  });
});

/** T8 hotfix: real period ends, cancel at period end, no checkout off-subscription. */
describe('addBillingCycle (IST)', () => {
  it('monthly from 31 Jan clamps to the last day of Feb', () => {
    // 31 Jan 2027 10:00 IST
    expect(addBillingCycle(new Date('2027-01-31T04:30:00Z'), 'MONTHLY').toISOString()).toBe(
      '2027-02-28T04:30:00.000Z',
    );
  });

  it('counts the IST date, not the UTC one', () => {
    // 1 Feb 2027 01:30 IST is still 31 Jan in UTC
    expect(addBillingCycle(new Date('2027-01-31T20:00:00Z'), 'MONTHLY').toISOString()).toBe(
      '2027-02-28T20:00:00.000Z', // 1 Mar 01:30 IST
    );
  });

  it('annual from 18 Oct ends on 18 Oct next year, not 1 Jan', () => {
    expect(addBillingCycle(new Date('2026-10-18T04:30:00Z'), 'ANNUAL').toISOString()).toBe(
      '2027-10-18T04:30:00.000Z',
    );
  });

  it('annual from 29 Feb clamps to 28 Feb', () => {
    expect(addBillingCycle(new Date('2028-02-29T04:30:00Z'), 'ANNUAL').toISOString()).toBe(
      '2029-02-28T04:30:00.000Z',
    );
  });
});

describe('SubscriptionService lifecycle', () => {
  const SECRET = 'test_secret';
  beforeAll(() => {
    process.env.RAZORPAY_KEY_SECRET = SECRET;
    process.env.RAZORPAY_KEY_ID ??= 'rzp_test_x';
  });

  /** A one-row in-memory DB: updates stick, payment/order ids claim once. */
  const build = (row: any, order?: any) => {
    const state = { id: 'sub-1', history: [], billingCycle: 'MONTHLY', lastPaymentAt: null, ...row };
    const claimed = new Set<string>();
    const prisma: any = {
      orgSubscription: {
        findUnique: jest.fn(async () => ({ ...state })),
        findUniqueOrThrow: jest.fn(async () => ({ ...state })),
        update: jest.fn(async ({ data }: any) => Object.assign(state, data)),
      },
      subscriptionHistory: {
        create: jest.fn(async () => ({})),
        createMany: jest.fn(async ({ data: [h] }: any) => {
          if (claimed.has(h.paymentId) || claimed.has(h.orderId)) return { count: 0 };
          claimed.add(h.paymentId).add(h.orderId);
          return { count: 1 };
        }),
        findFirst: jest.fn(async () => ({ subscriptionId: 'sub-1' })),
      },
      $queryRaw: jest.fn(async () => []),
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const cache = { setSpacePlan: jest.fn(), invalidateSpacePlanCache: jest.fn() };
    const email = {
      sendSubscriptionCancelled: jest.fn(async (_: any) => {}),
      sendSubscriptionUpgraded: jest.fn(async () => {}),
      sendSubscriptionActivated: jest.fn(async () => {}),
    };
    const svc = new SubscriptionService(
      prisma,
      cache as any,
      email as any,
      pricedPlanConfig(),
      rateCardTerms(),
    );
    (svc as any).razorpay = {
      orders: {
        fetch: jest.fn(async () => order),
        create: jest.fn(async (o: any) => ({ id: 'order_new', ...o })),
      },
    };
    (svc as any).resolveSpaceBillingRecipient = jest.fn(async () => ({ email: 'a@b.c', name: 'A' }));
    return { svc, prisma, email };
  };

  it('cancel keeps the plan and expiresAt, sets cancelledAt, and emails the end date', async () => {
    const expiresAt = new Date(Date.now() + 10 * 86400000);
    const { svc, prisma, email } = build({
      plan: 'PRO',
      expiresAt,
      cancelledAt: null,
    });
    await svc.cancelSubscriptionForSpace('space-A');
    const data = prisma.orgSubscription.update.mock.calls[0][0].data;
    expect(data.plan).toBeUndefined();
    expect(data.expiresAt).toBeUndefined();
    expect(data.cancelledAt).toBeInstanceOf(Date);
    expect(email.sendSubscriptionCancelled.mock.calls[0][0].expiresAt).not.toBe('immediately');
  });

  it('a space deal naming the plan prices its checkout (T4)', async () => {
    const { svc, prisma } = build({ plan: 'STARTER', billingCycle: 'MONTHLY' });
    const deal = { id: 'deal-1', plan: 'PRO', billingCycle: null, planPricePaise: 50_000 };
    (svc as any).terms = { activeDeal: jest.fn(async () => deal) };

    const quote = await svc.createUpgradeOrderForSpace('space-A', { plan: 'PRO', billingCycle: 'MONTHLY' } as any);
    expect(quote).toMatchObject({ amount: 500 });
    const notes = (svc as any).razorpay.orders.create.mock.calls[0][0].notes;
    expect(notes).toMatchObject({ dealId: 'deal-1', listPaise: '50000' });

    await svc.completeFromWebhook('o', 'p', { id: 'o', status: 'paid', amount: 50_000, notes });
    const data = prisma.orgSubscription.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ plan: 'PRO' });
    expect(Number(data.amount)).toBe(500);

    // A comped deal (0) is never sold through checkout.
    deal.planPricePaise = 0;
    await expect(
      svc.createUpgradeOrderForSpace('space-A', { plan: 'PRO', billingCycle: 'MONTHLY' } as any),
    ).rejects.toThrow(/via payment/);
  });

  it('a paid upgrade extends from the current expiresAt and clears cancelledAt', async () => {
    const expiresAt = new Date('2099-01-31T04:30:00Z');
    const order = {
      status: 'paid',
      amount: 99900,
      notes: { spaceId: 'space-A', plan: 'PRO', billingCycle: 'MONTHLY' },
    };
    const { svc, prisma } = build(
      { plan: 'PRO', expiresAt, cancelledAt: new Date() },
      order,
    );
    const signature = crypto.createHmac('sha256', SECRET).update('o|p').digest('hex');
    await svc.verifyAndActivateForSpace('space-A', { orderId: 'o', paymentId: 'p', signature });
    const data = prisma.orgSubscription.update.mock.calls[0][0].data;
    expect(data.expiresAt.toISOString()).toBe('2099-02-28T04:30:00.000Z');
    expect(data.cancelledAt).toBeNull();
  });

  const proMonthly = (expiresAt: Date, lastPaymentAt: Date | null = null) => ({
    plan: 'PRO',
    billingCycle: 'MONTHLY',
    expiresAt,
    lastPaymentAt,
    cancelledAt: null,
    pendingPlan: null,
  });

  it('buying the same plan renews at full price and extends from the current end', async () => {
    const expiresAt = new Date('2099-03-10T04:30:00Z');
    const { svc } = build(proMonthly(expiresAt));
    const quote = await svc.createUpgradeOrderForSpace('space-A', { plan: 'PRO', billingCycle: 'MONTHLY' } as any);
    expect(quote).toMatchObject({ kind: 'renew', amount: 2999, credit: 0 });
    expect(((svc as any).razorpay.orders.create.mock.calls[0][0].receipt as string).length).toBeLessThanOrEqual(40);

    const order = { id: 'o', status: 'paid', amount: 49900, notes: { spaceId: 'space-A', plan: 'PRO', billingCycle: 'MONTHLY', kind: 'renew' } };
    (svc as any).razorpay.orders.fetch.mockResolvedValue(order);
    const signature = crypto.createHmac('sha256', SECRET).update('o|p').digest('hex');
    const sub = await svc.verifyAndActivateForSpace('space-A', { orderId: 'o', paymentId: 'p', signature });
    expect(sub.expiresAt!.toISOString()).toBe('2099-04-10T04:30:00.000Z');
  });

  it('upgrading monthly to annual credits the unused days, in paise', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-02-14T04:30:00Z'));
    const { svc } = build(proMonthly(new Date('2027-02-28T04:30:00Z'), new Date('2027-01-31T04:30:00Z')));
    const quote = await svc.createUpgradeOrderForSpace('space-A', { plan: 'PRO', billingCycle: 'ANNUAL' } as any);
    jest.useRealTimers();
    // Pro ₹2,999/mo, 14 of 28 days left: ₹1,499.50 off Pro annual ₹29,990.
    expect(quote).toMatchObject({ kind: 'upgrade', credit: 1499.5, amount: 28490.5 });
    expect((svc as any).razorpay.orders.create.mock.calls[0][0].amount).toBe(2999000 - 149950);
  });

  it('a downgrade is paid now and starts at period end', async () => {
    const expiresAt = new Date('2099-10-18T04:30:00Z');
    const { svc } = build({ ...proMonthly(expiresAt), billingCycle: 'ANNUAL' });
    const order = { id: 'o', status: 'paid', amount: 49900, notes: { spaceId: 'space-A', plan: 'PRO', billingCycle: 'MONTHLY', kind: 'downgrade' } };
    await svc.completeFromWebhook('o', 'p', order);
    const sub = await svc.getSpaceSubscription('space-A');
    expect(sub).toMatchObject({ billingCycle: 'ANNUAL', pendingPlan: 'PRO', pendingBillingCycle: 'MONTHLY' });
    expect(sub.expiresAt!.toISOString()).toBe(expiresAt.toISOString());
  });

  it('webhook and browser verify on the same payment extend the plan once', async () => {
    const expiresAt = new Date('2099-03-10T04:30:00Z');
    const order = { id: 'o', status: 'paid', amount: 49900, notes: { spaceId: 'space-A', plan: 'PRO', billingCycle: 'MONTHLY', kind: 'renew' } };
    const { svc, prisma } = build(proMonthly(expiresAt), order);
    const signature = crypto.createHmac('sha256', SECRET).update('o|p').digest('hex');

    expect(await svc.completeFromWebhook('o', 'p', order)).toBe(true);
    const sub = await svc.verifyAndActivateForSpace('space-A', { orderId: 'o', paymentId: 'p', signature });
    expect(await svc.completeFromWebhook('o', 'p')).toBe(true);

    expect(prisma.orgSubscription.update).toHaveBeenCalledTimes(1);
    expect(sub.expiresAt!.toISOString()).toBe('2099-04-10T04:30:00.000Z');
  });

  it('the webhook ignores orders that are not plan orders', async () => {
    const { svc, prisma } = build(proMonthly(new Date()), { id: 'o', status: 'paid', amount: 100, notes: { registrationId: 'r' } });
    expect(await svc.completeFromWebhook('o', 'p')).toBe(false);
    expect(prisma.subscriptionHistory.createMany).not.toHaveBeenCalled();
  });
});

describe('SubscriptionSchedulerService expiry (T8)', () => {
  const build = (scanned: any, fresh: any) => {
    const prisma: any = {
      orgSubscription: {
        findMany: jest.fn(async () => [scanned]),
        findUniqueOrThrow: jest.fn(async () => fresh),
        update: jest.fn(async () => ({})),
      },
      subscriptionHistory: { create: jest.fn(async () => ({})) },
      $queryRaw: jest.fn(async () => []),
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const email = { sendSubscriptionExpired: jest.fn(async () => {}), sendSubscriptionDowngraded: jest.fn(async () => {}) };
    const cache = { invalidateSpacePlanCache: jest.fn() };
    const svc = new SubscriptionSchedulerService(prisma, email as any, cache as any, {} as any);
    return { svc, prisma, email };
  };
  const lapsed = {
    id: 'sub-1',
    spaceId: 'space-A',
    plan: 'PRO',
    billingCycle: 'MONTHLY',
    expiresAt: new Date(Date.now() - 10 * DAY),
    cancelledAt: null,
    pendingPlan: null,
    space: { creator: { fullName: 'A', identities: [{ email: 'a@b.c' }] } },
  };

  it('does not downgrade a space that paid between the scan and the lock', async () => {
    const paid = { ...lapsed, expiresAt: new Date(Date.now() + 30 * DAY) };
    const { svc, prisma, email } = build(lapsed, paid);
    await (svc as any).runHandleExpiredSubscriptions();
    expect(prisma.orgSubscription.update).not.toHaveBeenCalled();
    expect(prisma.subscriptionHistory.create).not.toHaveBeenCalled();
    expect(email.sendSubscriptionExpired).not.toHaveBeenCalled();
  });

  it('leaves a plan in grace alone', async () => {
    const grace = { ...lapsed, expiresAt: new Date(Date.now() - 2 * DAY) };
    const { svc, prisma } = build(grace, grace);
    await (svc as any).runHandleExpiredSubscriptions();
    expect(prisma.orgSubscription.update).not.toHaveBeenCalled();
  });

  it('downgrades a lapsed plan with a history row', async () => {
    const { svc, prisma } = build(lapsed, lapsed);
    await (svc as any).runHandleExpiredSubscriptions();
    expect(prisma.subscriptionHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ fromPlan: 'PRO', toPlan: 'STARTER', reason: 'Plan expired' }),
    });
    expect(prisma.orgSubscription.update.mock.calls[0][0].data.plan).toBe('STARTER');
  });

  it('starts a paid downgrade instead of expiring it', async () => {
    const pending = { ...lapsed, plan: 'PRO', billingCycle: 'ANNUAL', pendingPlan: 'PRO', pendingBillingCycle: 'MONTHLY' };
    const { svc, prisma, email } = build(pending, pending);
    await (svc as any).runHandleExpiredSubscriptions();
    const data = prisma.orgSubscription.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ plan: 'PRO', billingCycle: 'MONTHLY', pendingPlan: null });
    expect(data.expiresAt.getTime()).toBeGreaterThan(pending.expiresAt.getTime());
    expect(email.sendSubscriptionExpired).not.toHaveBeenCalled();
  });
});
