import { PaymentStatus, RegistrationStatus, SessionStatus } from '@prisma/client';
import { SessionsService } from './sessions.service';

/** S15/S51: cancelling a session refunds the base only (fee kept), once, through a claimed refundDueAt. */
describe('SessionsService.cancelSession', () => {
  const reg = { id: 'sr-1', userId: 'u-1', paymentId: 'pay_1', razorpayAmount: 102, processingFee: 2 };
  const build = ({ sessionClaim = 1, refundClaim = 1 } = {}) => {
    const calls: string[] = [];
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
        updateMany: jest.fn(async () => (calls.push('claimSession'), { count: sessionClaim })),
      },
      sessionRegistration: {
        findMany: jest.fn(async () => (calls.push('readPaid'), [reg])),
        // First call = bulk mark due; later calls = the per-row refund claim.
        updateMany: jest.fn(async (args: any) =>
          args.where.refundDueAt ? { count: refundClaim } : { count: 1 },
        ),
        findUniqueOrThrow: jest.fn(async () => reg),
        update: jest.fn(async () => ({})),
      },
    };
    const payments = { refund: jest.fn(async () => undefined) };
    const svc = new SessionsService(prisma, payments as any, {} as any, {} as any, {} as any, { can: jest.fn().mockResolvedValue(true) } as any);
    jest.spyOn(svc as any, 'assertCanManageSpace').mockResolvedValue(undefined);
    jest.spyOn(svc as any, 'getPrimaryEmail').mockResolvedValue(null);
    return { svc, prisma, payments, calls };
  };

  it('refunds the ticket price, not the processing fee', async () => {
    const { svc, prisma, payments } = build();
    await expect(svc.cancelSession('host', 's-1')).resolves.toMatchObject({ refunded: 1, totalPaid: 1 });
    expect(payments.refund).toHaveBeenCalledWith('pay_1', 100);
    expect(prisma.sessionRegistration.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['sr-1'] }, status: RegistrationStatus.REGISTERED },
      data: expect.objectContaining({ status: RegistrationStatus.CANCELLED, refundDueAt: expect.any(Date) }),
    });
    expect(prisma.sessionRegistration.update).toHaveBeenCalledWith({
      where: { id: 'sr-1' },
      data: expect.objectContaining({ refundDueAt: null, paymentStatus: PaymentStatus.REFUNDED }),
    });
  });

  it('reads paid attendees after claiming the session, so a verify in between is not missed', async () => {
    const { svc, calls } = build();
    await svc.cancelSession('host', 's-1');
    expect(calls).toEqual(['claimSession', 'readPaid']);
  });

  it('a concurrent second cancel refunds nothing', async () => {
    const { svc, payments } = build({ sessionClaim: 0 });
    await expect(svc.cancelSession('host', 's-1')).rejects.toThrow(/just changed/);
    expect(payments.refund).not.toHaveBeenCalled();
  });

  it('a refund another caller (retry job) already claimed is not sent twice', async () => {
    const { svc, payments } = build({ refundClaim: 0 });
    await expect(svc.cancelSession('host', 's-1')).resolves.toMatchObject({ refunded: 0 });
    expect(payments.refund).not.toHaveBeenCalled();
  });

  it('a failed refund stays due for the retry job', async () => {
    const { svc, prisma, payments } = build();
    payments.refund.mockRejectedValueOnce(new Error('gateway down'));
    await expect(svc.cancelSession('host', 's-1')).resolves.toMatchObject({ refunded: 0 });
    expect(prisma.sessionRegistration.update).not.toHaveBeenCalled();
  });
});
