import { BillingCycle, OrgPlan } from '@prisma/client';
import { PlanConfigService } from './plan-config.service';
import { addBillingCycle, prorationCreditPaise, SubscriptionService } from './subscription.service';
import { planPriceFor, TermsService } from './terms.service';

/** T6: plan pricing reads the space deal; without one nothing changes. */
const DAY = 86400000;
const planConfig = new PlanConfigService({} as any);

/** A deals table that honours the validity window the way Postgres would. */
const termsWith = (deals: any[]) =>
  new TermsService(
    {
      deal: {
        findMany: jest.fn(async ({ where }: any) => {
          const at: Date = where.validFrom.lte;
          return deals
            .filter((d) => !d.eventId && d.validFrom <= at && (!d.validUntil || d.validUntil > at))
            .sort((a, b) => b.validFrom - a.validFrom);
        }),
      },
    } as any,
    planConfig,
    {} as any,
  );

const deal = (over: any) => ({
  id: 'deal-1',
  spaceId: 'space-A',
  eventId: null,
  plan: OrgPlan.PRO,
  planPricePaise: null,
  billingCycle: null,
  validFrom: new Date('2020-01-01'),
  validUntil: null,
  ...over,
});

const build = (row: any, deals: any[] = [], lastPayment: any = null) => {
  const state = { id: 'sub-1', spaceId: 'space-A', cancelledAt: null, pendingPlan: null, lastPaymentAt: null, ...row };
  const prisma: any = {
    orgSubscription: {
      findUnique: jest.fn(async () => ({ ...state })),
      findUniqueOrThrow: jest.fn(async () => ({ ...state })),
      update: jest.fn(async ({ data }: any) => Object.assign(state, data)),
    },
    subscriptionHistory: {
      create: jest.fn(async () => ({})),
      createMany: jest.fn(async () => ({ count: 1 })),
      findFirst: jest.fn(async () => lastPayment),
    },
    $queryRaw: jest.fn(async () => []),
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  const svc = new SubscriptionService(
    prisma,
    { setSpacePlan: jest.fn(), invalidateSpacePlanCache: jest.fn() } as any,
    {} as any,
    planConfig,
    termsWith(deals),
  );
  (svc as any).razorpay = { orders: { create: jest.fn(async (o: any) => ({ id: 'order_new', ...o })) } };
  (svc as any).resolveSpaceBillingRecipient = jest.fn(async () => ({ email: null, name: 'A' }));
  return { svc, prisma, state };
};

describe('planPriceFor', () => {
  const card = { monthlyPrice: 1499, annualPrice: 13999 };
  it('no deal: the rate card in paise', () => {
    expect(planPriceFor(card, OrgPlan.PRO, BillingCycle.MONTHLY, null)).toEqual({ pricePaise: 149900, dealId: null });
    expect(planPriceFor({ monthlyPrice: null, annualPrice: null }, OrgPlan.ENTERPRISE, BillingCycle.ANNUAL, null))
      .toEqual({ pricePaise: null, dealId: null });
  });
  it('a deal naming the plan prices it; null price keeps the rate card; 0 is comp', () => {
    expect(planPriceFor(card, OrgPlan.PRO, BillingCycle.ANNUAL, deal({ planPricePaise: 900000 }))).toEqual({ pricePaise: 900000, dealId: 'deal-1' });
    expect(planPriceFor(card, OrgPlan.PRO, BillingCycle.ANNUAL, deal({}))).toEqual({ pricePaise: 1399900, dealId: 'deal-1' });
    expect(planPriceFor(card, OrgPlan.PRO, BillingCycle.MONTHLY, deal({ planPricePaise: 0 }))).toEqual({ pricePaise: 0, dealId: 'deal-1' });
  });
  it('another plan or cycle than the deal names stays on the rate card', () => {
    expect(planPriceFor(card, OrgPlan.PRO, BillingCycle.MONTHLY, deal({ plan: OrgPlan.ENTERPRISE, planPricePaise: 1 })).dealId).toBeNull();
    expect(planPriceFor(card, OrgPlan.PRO, BillingCycle.MONTHLY, deal({ billingCycle: 'ANNUAL', planPricePaise: 1 })))
      .toEqual({ pricePaise: 149900, dealId: null });
  });
});

describe('plan checkout parity without a deal (T6)', () => {
  beforeAll(() => {
    process.env.RAZORPAY_KEY_ID ??= 'rzp_test_x';
  });
  afterEach(() => jest.useRealTimers());

  /** The pre-T6 pricing, verbatim: list price minus unused days at list price. */
  const legacyAmountPaise = (sub: any, plan: OrgPlan, cycle: BillingCycle, now: Date) => {
    const limits = planConfig.getLimits(plan);
    const price = (cycle === 'MONTHLY' ? limits.monthlyPrice : limits.annualPrice)! * 100;
    const rank = { STARTER: 0, CLUB: 1, GROWTH: 2, PRO: 3, ENTERPRISE: 4 } as const;
    const diff = rank[plan] - rank[sub.plan as OrgPlan] || (cycle === 'ANNUAL' ? 1 : 0) - (sub.billingCycle === 'ANNUAL' ? 1 : 0);
    const paidLeft = sub.plan !== 'STARTER' && sub.expiresAt && sub.expiresAt > now;
    if (diff <= 0 || !paidLeft) return price;
    const cur = planConfig.getLimits(sub.plan);
    const curPrice = sub.billingCycle === 'MONTHLY' ? cur.monthlyPrice : cur.annualPrice;
    return price - (curPrice ? prorationCreditPaise(curPrice * 100, sub.billingCycle, sub.expiresAt, now, sub.lastPaymentAt) : 0);
  };

  const now = new Date('2027-02-14T04:30:00Z');
  const subs = [
    { plan: 'STARTER', billingCycle: 'MONTHLY', expiresAt: null },
    { plan: 'GROWTH', billingCycle: 'MONTHLY', expiresAt: new Date('2027-02-28T04:30:00Z'), lastPaymentAt: new Date('2027-01-31T04:30:00Z') },
    { plan: 'GROWTH', billingCycle: 'ANNUAL', expiresAt: new Date('2027-09-01T00:00:00Z') },
    { plan: 'PRO', billingCycle: 'MONTHLY', expiresAt: new Date('2027-03-01T00:00:00Z') },
    { plan: 'PRO', billingCycle: 'MONTHLY', expiresAt: new Date('2027-02-10T00:00:00Z') },
    { plan: 'PRO', billingCycle: 'ANNUAL', expiresAt: new Date('2027-12-25T10:00:00Z') },
  ];
  const targets: [OrgPlan, BillingCycle][] = [
    ['PRO', 'MONTHLY'],
    ['PRO', 'ANNUAL'],
  ];
  // Payments before T6 carry no price; plans set by an admin have no payment.
  const lastPayments = [null, { toPlan: 'PRO', pricePaise: null }];

  for (const sub of subs)
    for (const [plan, cycle] of targets)
      for (const last of lastPayments)
        it(`${sub.plan} ${sub.billingCycle} (ends ${sub.expiresAt?.toISOString().slice(0, 10) ?? 'never'}) -> ${plan} ${cycle}, last payment ${last ? 'pre-T6' : 'none'}`, async () => {
          jest.useFakeTimers().setSystemTime(now);
          const { svc } = build(sub, [], last);
          const expected = legacyAmountPaise(sub, plan, cycle, now);
          const call = svc.createUpgradeOrderForSpace('space-A', { plan, billingCycle: cycle } as any);
          // Unused time worth more than the plan was refused before, and still is.
          if (expected < 100) return expect(call).rejects.toThrow(/already covers/);
          await call;
          const order = (svc as any).razorpay.orders.create.mock.calls[0][0];
          expect(order.amount).toBe(expected);
          expect(order.notes.dealId).toBeUndefined();
        });
});

describe('plan pricing under a deal (T6)', () => {
  afterEach(() => jest.useRealTimers());
  const proMonthly = {
    plan: 'PRO',
    billingCycle: 'MONTHLY',
    expiresAt: new Date('2027-02-28T04:30:00Z'),
    lastPaymentAt: new Date('2027-01-31T04:30:00Z'),
  };

  it('checkout charges the deal price and the payment records the deal and price', async () => {
    const { svc, prisma, state } = build({ plan: 'STARTER', billingCycle: 'MONTHLY' }, [deal({ planPricePaise: 99_900 })]);
    const q = await svc.createUpgradeOrderForSpace('space-A', { plan: 'PRO', billingCycle: 'MONTHLY' } as any);
    expect(q.amount).toBe(999);
    const order = (svc as any).razorpay.orders.create.mock.calls[0][0];
    expect(order.notes).toMatchObject({ dealId: 'deal-1', listPaise: '99900' });

    await svc.completeFromWebhook('o', 'p', { id: 'o', status: 'paid', amount: order.amount, notes: order.notes });
    expect(prisma.subscriptionHistory.createMany.mock.calls[0][0].data[0]).toMatchObject({
      amountPaise: 99_900,
      pricePaise: 99_900,
      dealId: 'deal-1',
    });
    expect(Number(state.amount)).toBe(999);
  });

  it('a rate-card payment records its price and no deal', async () => {
    const { svc, prisma } = build({ plan: 'STARTER', billingCycle: 'MONTHLY' });
    const q = await svc.createUpgradeOrderForSpace('space-A', { plan: 'PRO', billingCycle: 'MONTHLY' } as any);
    const order = (svc as any).razorpay.orders.create.mock.calls[0][0];
    expect(q.amount).toBe(2999);
    await svc.completeFromWebhook('o', 'p', { id: 'o', status: 'paid', amount: order.amount, notes: order.notes });
    expect(prisma.subscriptionHistory.createMany.mock.calls[0][0].data[0]).toMatchObject({ pricePaise: 299_900, dealId: null });
  });

  it('upgrade credit is at what the period cost, not list price', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-02-14T04:30:00Z'));
    // Paid ₹600 for this Pro month under a deal that has since ended.
    const { svc } = build(proMonthly, [], { toPlan: 'PRO', pricePaise: 60_000 });
    const q = await svc.createUpgradeOrderForSpace('space-A', { plan: 'PRO', billingCycle: 'ANNUAL' } as any);
    // 14 of 28 days left of ₹600 = ₹300 off the rate-card annual ₹29,990.
    expect(q).toMatchObject({ kind: 'upgrade', credit: 300, amount: 29_690 });
  });

  it('a comped plan (deal price 0, never paid) earns no credit and is never sold', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-02-14T04:30:00Z'));
    const comp = deal({ planPricePaise: 0, billingCycle: 'MONTHLY' });
    const { svc } = build(proMonthly, [comp]);
    // Annual isn't comped, so it sells at the rate card with no credit.
    const q = await svc.createUpgradeOrderForSpace('space-A', { plan: 'PRO', billingCycle: 'ANNUAL' } as any);
    expect(q).toMatchObject({ credit: 0, amount: 29_990 });
    await expect(
      svc.createUpgradeOrderForSpace('space-A', { plan: 'PRO', billingCycle: 'MONTHLY' } as any),
    ).rejects.toThrow(/via payment/);
  });

  it('an expired deal falls back to the rate card', async () => {
    const ended = deal({ planPricePaise: 1_000, validUntil: new Date(Date.now() - DAY) });
    const { svc } = build({ plan: 'STARTER', billingCycle: 'MONTHLY' }, [ended]);
    const q = await svc.createUpgradeOrderForSpace('space-A', { plan: 'PRO', billingCycle: 'MONTHLY' } as any);
    expect(q.amount).toBe(2999);
    expect((svc as any).razorpay.orders.create.mock.calls[0][0].notes.dealId).toBeUndefined();
  });

  it('offline payment defaults to the deal price and records the deal', async () => {
    const { svc, prisma, state } = build({ plan: 'STARTER', billingCycle: 'MONTHLY' }, [deal({ planPricePaise: 1_000_000 })]);
    await svc.recordOfflinePaymentForSpace('space-A', { plan: 'PRO', billingCycle: 'ANNUAL' } as any);
    expect(prisma.subscriptionHistory.create.mock.calls[0][0].data).toMatchObject({
      amountPaise: 1_000_000,
      pricePaise: 1_000_000,
      dealId: 'deal-1',
    });
    expect(Number(state.amount)).toBe(10_000);
    expect(state.expiresAt).toEqual(addBillingCycle(state.lastPaymentAt, 'ANNUAL'));
  });

  it('offline payment without a deal records what was entered, as before', async () => {
    const { svc, prisma, state } = build({ plan: 'STARTER', billingCycle: 'MONTHLY' });
    await svc.recordOfflinePaymentForSpace('space-A', { plan: 'PRO', billingCycle: 'ANNUAL', amount: 4499.5 } as any);
    expect(prisma.subscriptionHistory.create.mock.calls[0][0].data).toMatchObject({ amountPaise: 449_950, dealId: null });
    expect(Number(state.amount)).toBe(4499.5);
  });

  it('offline payment on a plan with no set price needs an amount', async () => {
    const { svc } = build({ plan: 'STARTER', billingCycle: 'MONTHLY' });
    await expect(
      svc.recordOfflinePaymentForSpace('space-A', { plan: 'ENTERPRISE', billingCycle: 'ANNUAL' } as any),
    ).rejects.toThrow(/amount received/);
  });

  it('an admin plan change takes the deal price; without a deal the amount is left alone', async () => {
    const withDeal = build({ plan: 'STARTER', billingCycle: 'MONTHLY', amount: 0 }, [deal({ planPricePaise: 77_700 })]);
    await withDeal.svc.adminUpdateSubscriptionForSpace('space-A', { plan: 'PRO' } as any);
    expect(withDeal.prisma.orgSubscription.update.mock.calls[0][0].data.amount).toBe(777);

    const noDeal = build({ plan: 'STARTER', billingCycle: 'MONTHLY', amount: 0 });
    await noDeal.svc.adminUpdateSubscriptionForSpace('space-A', { plan: 'PRO' } as any);
    expect(noDeal.prisma.orgSubscription.update.mock.calls[0][0].data.amount).toBeUndefined();
  });

  it('MRR counts the price a payment bought (deal, before credit), falling back to the amount', async () => {
    const live = { plan: 'PRO', billingCycle: 'MONTHLY', expiresAt: new Date(Date.now() + 10 * DAY), cancelledAt: null, pendingPlan: null, pendingBillingCycle: null };
    const { svc, prisma } = build({});
    prisma.space = { findMany: jest.fn(async () => []) };
    prisma.subscriptionHistory.findMany = jest.fn(async () => [
      { amountPaise: 20_000, pricePaise: 99_900, subscription: live },
      { amountPaise: 149_900, pricePaise: null, subscription: live },
      { amountPaise: 1_200_000, pricePaise: 1_200_000, subscription: { ...live, billingCycle: 'ANNUAL' } },
    ]);
    expect((await svc.getSpaceBillingStats()).mrr).toBe(999 + 1499 + 1000);
  });
});
