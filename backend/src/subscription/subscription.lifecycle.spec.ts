import * as crypto from 'crypto';
import { addBillingCycle, SubscriptionService } from './subscription.service';

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

  const build = (row: any, order?: any) => {
    const prisma: any = {
      orgSubscription: {
        findUnique: jest.fn(async () => ({ id: 'sub-1', history: [], ...row })),
        update: jest.fn(async ({ data }: any) => ({ amount: 999, ...data })),
      },
      subscriptionHistory: { create: jest.fn(async () => ({})) },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const cache = { setSpacePlan: jest.fn(), invalidateSpacePlanCache: jest.fn() };
    const email = {
      sendSubscriptionCancelled: jest.fn(async (_: any) => {}),
      sendSubscriptionUpgraded: jest.fn(async () => {}),
    };
    const svc = new SubscriptionService(prisma, cache as any, email as any, {} as any);
    (svc as any).razorpay = {
      orders: { fetch: jest.fn(async () => order), create: jest.fn() },
    };
    (svc as any).resolveSpaceBillingRecipient = jest.fn(async () => ({ email: 'a@b.c', name: 'A' }));
    return { svc, prisma, email };
  };

  it('cancel keeps the plan and expiresAt, sets cancelledAt, and emails the end date', async () => {
    const expiresAt = new Date(Date.now() + 10 * 86400000);
    const { svc, prisma, email } = build({
      plan: 'PRO',
      billingModel: 'SUBSCRIPTION',
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

  it.each(['FREE', 'REVENUE_SHARE'])('blocks plan checkout on %s billing', async (billingModel) => {
    const { svc, prisma } = build({ plan: 'STARTER', billingModel, billingCycle: 'MONTHLY' });
    await expect(
      svc.createUpgradeOrderForSpace('space-A', { plan: 'PRO', billingCycle: 'MONTHLY' } as any),
    ).rejects.toThrow(/arranged by Unifesto/);
    expect((svc as any).razorpay.orders.create).not.toHaveBeenCalled();
    expect(prisma.orgSubscription.update).not.toHaveBeenCalled();
  });

  it('a paid upgrade extends from the current expiresAt and clears cancelledAt', async () => {
    const expiresAt = new Date('2099-01-31T04:30:00Z');
    const order = {
      status: 'paid',
      amount: 99900,
      notes: { spaceId: 'space-A', plan: 'PRO', billingCycle: 'MONTHLY' },
    };
    const { svc, prisma } = build(
      { plan: 'PRO', billingModel: 'SUBSCRIPTION', expiresAt, cancelledAt: new Date() },
      order,
    );
    const signature = crypto.createHmac('sha256', SECRET).update('o|p').digest('hex');
    await svc.verifyAndActivateForSpace('space-A', { orderId: 'o', paymentId: 'p', signature });
    const data = prisma.orgSubscription.update.mock.calls[0][0].data;
    expect(data.expiresAt.toISOString()).toBe('2099-02-28T04:30:00.000Z');
    expect(data.cancelledAt).toBeNull();
  });
});
