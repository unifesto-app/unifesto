import { PaymentStatus, RegistrationStatus } from '@prisma/client';
import { SessionsService } from './sessions.service';

/** S2: PAID unlocks the LiveKit join token, so a receipt must match this row's order. */
describe('SessionsService.verifyPayment replay guards', () => {
  const build = (row: any) => {
    const prisma: any = {
      sessionRegistration: {
        findUnique: jest.fn(async () => row),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      session: { update: jest.fn(async () => ({})) },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const payments = { verifyPaymentSignature: jest.fn(() => true) };
    const svc = new SessionsService(prisma, payments as any, {} as any, {} as any, {} as any);
    return { svc, prisma };
  };
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'sr-1',
    sessionId: 's-1',
    userId: 'u-1',
    orderId: 'order_current',
    paymentStatus: PaymentStatus.PENDING,
    status: RegistrationStatus.REGISTERED,
    ...over,
  });
  const verify = (svc: SessionsService, orderId: string) =>
    svc.verifyPayment('u-1', {
      registrationId: 'sr-1',
      razorpayOrderId: orderId,
      razorpayPaymentId: 'pay_x',
      razorpaySignature: 'sig',
    } as any);

  it('rejects a receipt for another order', async () => {
    const { svc, prisma } = build(row());
    await expect(verify(svc, 'order_other')).rejects.toThrow(/different order/);
    expect(prisma.sessionRegistration.updateMany).not.toHaveBeenCalled();
  });

  it('never revives a refunded/cancelled row with its original receipt', async () => {
    const { svc, prisma } = build(
      row({ paymentStatus: PaymentStatus.REFUNDED, status: RegistrationStatus.CANCELLED }),
    );
    await expect(verify(svc, 'order_current')).rejects.toThrow(/no longer be paid/);
    expect(prisma.sessionRegistration.updateMany).not.toHaveBeenCalled();
  });

  it('settles the matching order once', async () => {
    const { svc, prisma } = build(row());
    await expect(verify(svc, 'order_current')).resolves.toEqual({ registrationId: 'sr-1', paid: true });
    expect(prisma.session.update).toHaveBeenCalledTimes(1);
  });
});
