import * as crypto from 'crypto';
import { SubscriptionService } from './subscription.service';
import { PlanConfigService } from './plan-config.service';
import { rateCardTerms } from './terms.testing';

/** S3: an upgrade receipt is good for one space, one paid order, once. */
describe('SubscriptionService.verifyAndActivateForSpace replay guards', () => {
  const SECRET = 'test_secret';
  beforeAll(() => {
    process.env.RAZORPAY_KEY_SECRET = SECRET;
    process.env.RAZORPAY_KEY_ID ??= "rzp_test_x";
  });
  const sign = (o: string, p: string) =>
    crypto.createHmac('sha256', SECRET).update(`${o}|${p}`).digest('hex');

  const build = (
    order: any,
    claim: jest.Mock = jest.fn(async () => ({ count: 1 })),
    prior: any = null,
  ) => {
    const row = { id: 'sub-1', plan: 'STARTER', billingCycle: 'MONTHLY', expiresAt: null, history: [] };
    const prisma: any = {
      orgSubscription: {
        findUnique: jest.fn(async () => row),
        findUniqueOrThrow: jest.fn(async () => row),
        update: jest.fn(async () => ({ amount: 999 })),
      },
      subscriptionHistory: { createMany: claim, findFirst: jest.fn(async () => prior) },
      $queryRaw: jest.fn(async () => []),
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const cache = { setSpacePlan: jest.fn(), invalidateSpacePlanCache: jest.fn() };
    const svc = new SubscriptionService(prisma, cache as any, {} as any, new PlanConfigService({} as any), rateCardTerms());
    (svc as any).razorpay = { orders: { fetch: jest.fn(async () => order) } };
    (svc as any).resolveSpaceBillingRecipient = jest.fn(async () => ({}));
    return { svc, prisma };
  };
  const dto = (signature = sign('order_1', 'pay_1')) => ({
    orderId: 'order_1',
    paymentId: 'pay_1',
    signature,
  });
  const paidOrder = (spaceId = 'space-A') => ({
    id: 'order_1',
    status: 'paid',
    amount: 99900,
    notes: { spaceId, plan: 'PRO', billingCycle: 'MONTHLY' },
  });

  it('rejects a bad signature', async () => {
    const { svc } = build(paidOrder());
    await expect(svc.verifyAndActivateForSpace('space-A', dto('deadbeef'))).rejects.toThrow(/signature/);
  });

  it("rejects another space's paid order", async () => {
    const { svc, prisma } = build(paidOrder('space-B'));
    await expect(svc.verifyAndActivateForSpace('space-A', dto())).rejects.toThrow(/different space/);
    expect(prisma.orgSubscription.update).not.toHaveBeenCalled();
  });

  it('rejects an order that is not paid', async () => {
    const { svc } = build({ ...paidOrder(), status: 'attempted' });
    await expect(svc.verifyAndActivateForSpace('space-A', dto())).rejects.toThrow(/not been paid/);
  });

  it('rejects a payment id already used on another subscription', async () => {
    const taken = jest.fn(async () => ({ count: 0 }));
    const { svc, prisma } = build(paidOrder(), taken, { subscriptionId: 'sub-OTHER' });
    await expect(svc.verifyAndActivateForSpace('space-A', dto())).rejects.toThrow(/already been used/);
    expect(prisma.orgSubscription.update).not.toHaveBeenCalled();
  });

  it('records the payment and order ids on a valid upgrade', async () => {
    const claim = jest.fn(async () => ({ count: 1 }));
    const { svc } = build(paidOrder(), claim);
    await svc.verifyAndActivateForSpace('space-A', dto());
    expect(claim).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ paymentId: 'pay_1', orderId: 'order_1', toPlan: 'PRO', amountPaise: 99900 }),
      ],
      skipDuplicates: true,
    });
  });
});
