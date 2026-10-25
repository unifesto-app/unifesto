import { PaymentStatus, Prisma, RegistrationStatus, SessionStatus } from '@prisma/client';
import { SessionsService } from './sessions.service';
import { rateCardTerms } from '../subscription/terms.testing';

/**
 * A16: closing the payment sheet must not lock a payer out of a paid session,
 * and a capture whose client verify never arrives is settled by the webhook.
 */
describe('SessionsService paid-session recovery (A16)', () => {
  const session = {
    id: 's-1',
    spaceId: 'sp-1',
    createdBy: 'host',
    status: SessionStatus.PUBLISHED,
    deletedAt: null,
    startDateTime: new Date(Date.now() + 86_400_000),
    capacity: 10,
    registeredCount: 3,
    price: new Prisma.Decimal(100),
  };
  const build = (row: Record<string, unknown> | null) => {
    const reg = row && {
      id: 'sr-1',
      sessionId: 's-1',
      userId: 'u-1',
      orderId: 'order_1',
      paymentId: null,
      razorpayAmount: new Prisma.Decimal(105),
      paymentStatus: PaymentStatus.PENDING,
      status: RegistrationStatus.REGISTERED,
      ...row,
    };
    const prisma: any = {
      space: { findFirst: jest.fn(async () => ({ status: 'ACTIVE' })) }, // J16 live-space gate
      $executeRaw: jest.fn(async () => 1),
      session: { findUnique: jest.fn(async () => session) },
      sessionRegistration: {
        findUnique: jest.fn(async () => reg),
        findFirst: jest.fn(async () => reg),
        upsert: jest.fn(async () => reg ?? { id: 'sr-new' }),
        updateMany: jest.fn(async () => ({ count: 1 })),
        update: jest.fn(async () => ({})),
      },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const payments = {
      computeProcessingFee: jest.fn(() => 5),
      createOrder: jest.fn(async () => ({ orderId: 'order_2', currency: 'INR' })),
      fetchOrderNotes: jest.fn(async () => ({})),
      refund: jest.fn(async () => 'rfnd_1'),
    };
    const svc = new SessionsService(prisma, payments as any, {} as any, {} as any, {} as any, { can: jest.fn() } as any, rateCardTerms());
    jest.spyOn(svc as any, 'isSessionHost').mockResolvedValue(false);
    return { svc, prisma, payments };
  };

  it('an unpaid row gets a fresh order instead of "Already registered"', async () => {
    const { svc, payments } = build({});
    await expect(svc.register('u-1', 's-1')).resolves.toMatchObject({ needsPayment: true, razorpayOrderId: 'order_2' });
    expect(payments.createOrder).toHaveBeenCalledTimes(1);
  });

  it('a paid row is still "Already registered"', async () => {
    const { svc } = build({ paymentStatus: PaymentStatus.PAID, paymentId: 'pay_1' });
    await expect(svc.register('u-1', 's-1')).rejects.toThrow('Already registered');
  });

  it('the webhook settles a capture whose verify never arrived', async () => {
    const { svc, prisma } = build({});
    await expect(
      svc.completeFromWebhook('order_1', 'pay_1', { amount: 10500, currency: 'INR' }),
    ).resolves.toBe(true);
    expect(prisma.sessionRegistration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentStatus: PaymentStatus.PAID, paymentId: 'pay_1' }) }),
    );
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });

  it('the webhook finds a row whose orderId a retry replaced, via server order notes', async () => {
    const { svc, prisma, payments } = build({ orderId: 'order_2' });
    prisma.sessionRegistration.findFirst.mockResolvedValueOnce(null);
    payments.fetchOrderNotes.mockResolvedValueOnce({ sessionId: 's-1', registrationId: 'sr-1' });
    await svc.completeFromWebhook('order_1', 'pay_1', { amount: 10500, currency: 'INR' });
    expect(prisma.sessionRegistration.updateMany).toHaveBeenCalled();
  });

  it('the webhook does not settle a wrong amount, and ignores orders that are not sessions', async () => {
    const { svc, prisma } = build({});
    await expect(svc.completeFromWebhook('order_1', 'pay_1', { amount: 100, currency: 'INR' })).resolves.toBe(true);
    expect(prisma.sessionRegistration.updateMany).not.toHaveBeenCalled();

    const none = build(null);
    await expect(none.svc.completeFromWebhook('order_x', 'pay_x', { amount: 100, currency: 'INR' })).resolves.toBe(false);
  });
});
