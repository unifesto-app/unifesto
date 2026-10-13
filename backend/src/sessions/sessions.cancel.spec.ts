import { PaymentStatus, RegistrationStatus, SessionStatus } from '@prisma/client';
import { SessionsService } from './sessions.service';

/** S15: cancelling a session refunds the base only (fee kept), once. */
describe('SessionsService.cancelSession', () => {
  const build = (claimCount = 1) => {
    const prisma: any = {
      session: {
        findUnique: jest.fn(async () => ({
          id: 's-1',
          spaceId: 'space-1',
          title: 'Talk',
          status: SessionStatus.PUBLISHED,
          deletedAt: null,
          startDateTime: new Date(Date.now() + 86_400_000),
        })),
        updateMany: jest.fn(async () => ({ count: claimCount })),
      },
      sessionRegistration: {
        findMany: jest.fn(async () => [
          { id: 'sr-1', userId: 'u-1', paymentId: 'pay_1', razorpayAmount: 102, processingFee: 2 },
        ]),
        update: jest.fn(async () => ({})),
      },
      userIdentity: { findFirst: jest.fn(async () => null) },
    };
    const payments = { refund: jest.fn(async () => undefined) };
    const svc = new SessionsService(prisma, payments as any, {} as any, {} as any, {} as any);
    jest.spyOn(svc as any, 'assertCanManageSpace').mockResolvedValue(undefined);
    jest.spyOn(svc as any, 'getPrimaryEmail').mockResolvedValue(null);
    return { svc, prisma, payments };
  };

  it('refunds the ticket price, not the processing fee', async () => {
    const { svc, prisma, payments } = build();
    await svc.cancelSession('host', 's-1');
    expect(payments.refund).toHaveBeenCalledWith('pay_1', 100);
    expect(prisma.sessionRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: RegistrationStatus.CANCELLED,
          paymentStatus: PaymentStatus.REFUNDED,
        }),
      }),
    );
  });

  it('a concurrent second cancel refunds nothing', async () => {
    const { svc, payments } = build(0);
    await expect(svc.cancelSession('host', 's-1')).rejects.toThrow(/just changed/);
    expect(payments.refund).not.toHaveBeenCalled();
  });
});
