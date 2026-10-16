import { BadRequestException } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { TeamChangesService } from './team-changes.service';

/** S51: an add-seats payment that couldn't add seats goes back once, through a claimed refundDueAt. */
describe('TeamChangesService add-seats refund', () => {
  const purchase = {
    id: 'gp-1',
    userId: 'u-1',
    registrationId: 'r-1',
    seats: 2,
    paymentId: 'pay_1',
    totalAmount: 420,
    registration: { event: { title: 'Hack' } },
  };
  const build = (claim = 1) => {
    const prisma: any = {
      $executeRaw: jest.fn(async () => 0),
      groupSeatPurchase: {
        updateMany: jest.fn(async () => ({ count: claim })),
        findUniqueOrThrow: jest.fn(async () => purchase),
        update: jest.fn(async () => ({})),
      },
      eventRegistration: { findUniqueOrThrow: jest.fn(async () => ({ id: 'r-1' })) },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const payments = { refund: jest.fn(async () => undefined) };
    const svc = new TeamChangesService(prisma, {} as any, payments as any, {} as any, {} as any);
    jest.spyOn(svc as any, 'push').mockImplementation(() => undefined);
    return { svc, prisma, payments };
  };

  it('marks the payment due in the settling transaction, then refunds it in full', async () => {
    const { svc, prisma, payments } = build();
    jest.spyOn(svc as any, 'growInTx').mockRejectedValue(new BadRequestException('sold out'));
    await expect((svc as any).settle('gp-1', 'pay_1')).resolves.toMatchObject({ outcome: 'refund' });
    expect(prisma.groupSeatPurchase.update).toHaveBeenCalledWith({
      where: { id: 'gp-1' },
      data: { refundDueAt: expect.any(Date) },
    });
    expect(payments.refund).toHaveBeenCalledWith('pay_1', 420);
    expect(prisma.groupSeatPurchase.update).toHaveBeenLastCalledWith({
      where: { id: 'gp-1' },
      data: { paymentStatus: PaymentStatus.REFUNDED, refundedAmount: 420, refundDueAt: null },
    });
  });

  it('a refund another replica claimed is not sent twice', async () => {
    const { svc, payments } = build(0);
    await expect(svc.refundDue('gp-1')).resolves.toBe(false);
    expect(payments.refund).not.toHaveBeenCalled();
  });

  it('a failed refund stays due for the retry job', async () => {
    const { svc, prisma, payments } = build();
    payments.refund.mockRejectedValueOnce(new Error('gateway down'));
    await expect(svc.refundDue('gp-1')).resolves.toBe(false);
    expect(prisma.groupSeatPurchase.update).not.toHaveBeenCalled();
  });
});
