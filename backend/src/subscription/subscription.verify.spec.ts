import * as crypto from 'crypto';
import { SubscriptionService } from './subscription.service';

/** S3: an upgrade receipt is good for one space, one paid order, once. */
describe('SubscriptionService.verifyAndActivateForSpace replay guards', () => {
  const SECRET = 'test_secret';
  beforeAll(() => {
    process.env.RAZORPAY_KEY_SECRET = SECRET;
    process.env.RAZORPAY_KEY_ID ??= "rzp_test_x";
  });
  const sign = (o: string, p: string) =>
    crypto.createHmac('sha256', SECRET).update(`${o}|${p}`).digest('hex');

  const build = (order: any, historyCreate: jest.Mock = jest.fn(async () => ({}))) => {
    const prisma: any = {
      orgSubscription: {
        findUnique: jest.fn(async () => ({ id: 'sub-1', plan: 'STARTER', history: [] })),
        update: jest.fn(async () => ({ amount: 999 })),
      },
      subscriptionHistory: { create: historyCreate },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const cache = { setSpacePlan: jest.fn(), invalidateSpacePlanCache: jest.fn() };
    const svc = new SubscriptionService(prisma, cache as any, {} as any, {} as any);
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

  it('rejects a payment id already used (unique on subscription_history)', async () => {
    const dup = jest.fn(async () => {
      throw Object.assign(new Error('unique'), { code: 'P2002' });
    });
    const { svc, prisma } = build(paidOrder(), dup);
    await expect(svc.verifyAndActivateForSpace('space-A', dto())).rejects.toThrow(/already been used/);
    expect(prisma.orgSubscription.update).not.toHaveBeenCalled();
  });

  it('records the payment id on a valid upgrade', async () => {
    const create = jest.fn(async () => ({}));
    const { svc } = build(paidOrder(), create);
    await svc.verifyAndActivateForSpace('space-A', dto());
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ paymentId: 'pay_1', toPlan: 'PRO' }),
    });
  });
});
