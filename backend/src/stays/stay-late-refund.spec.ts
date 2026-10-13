import { PaymentStatus, StayBookingStatus } from '@prisma/client';
import { StayBookingsService } from './stay-bookings.service';

/**
 * S15: a late payment on a closed stay goes back in full. A refund that fails
 * must stay due (retried, kept out of payouts), not sit as PAID on a closed
 * booking.
 */
describe('StayBookingsService late-payment refund', () => {
  const booking = {
    id: 'b-1',
    userId: 'u-1',
    optionId: 'opt-1',
    paymentId: 'pay_1',
    totalAmount: 1020,
    status: StayBookingStatus.EXPIRED,
    paymentStatus: PaymentStatus.PENDING,
    stay: { name: 'Hostel' },
  };
  const build = (claim = 1) => {
    const prisma: any = {
      $executeRaw: jest.fn(async () => 1),
      stayBooking: {
        findUniqueOrThrow: jest.fn(async () => ({ ...booking })),
        update: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: claim })),
      },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const payments = { refund: jest.fn(async () => undefined) };
    const svc = new StayBookingsService(prisma, {} as any, payments as any, {} as any, {} as any);
    jest.spyOn(svc as any, 'notify').mockImplementation(() => undefined);
    jest.spyOn(svc as any, 'fits').mockResolvedValue('No beds left'); // truthy = doesn't fit
    return { svc, prisma, payments };
  };

  it('marks the payment due for refund in the same write that records it', async () => {
    const { svc, prisma } = build();
    await (svc as any).settle('b-1', 'pay_1', 'order_1');
    expect(prisma.stayBooking.update).toHaveBeenCalledWith({
      where: { id: 'b-1' },
      data: expect.objectContaining({ paymentStatus: PaymentStatus.PAID, refundDueAt: expect.any(Date) }),
    });
  });

  it('a failed refund stays due and never reads as settled', async () => {
    const { svc, prisma, payments } = build();
    payments.refund.mockRejectedValueOnce(new Error('gateway down'));
    await expect(svc.refundDue('b-1')).resolves.toBe(false);
    expect(prisma.stayBooking.update).not.toHaveBeenCalled();
  });

  it('a successful refund clears the flag', async () => {
    const { svc, prisma, payments } = build();
    await expect(svc.refundDue('b-1')).resolves.toBe(true);
    expect(payments.refund).toHaveBeenCalledWith('pay_1', 1020);
    expect(prisma.stayBooking.update).toHaveBeenCalledWith({
      where: { id: 'b-1' },
      data: { paymentStatus: PaymentStatus.REFUNDED, refundedAmount: 1020, refundDueAt: null },
    });
  });

  it('a row another replica claimed is not refunded twice', async () => {
    const { svc, payments } = build(0);
    await expect(svc.refundDue('b-1')).resolves.toBe(false);
    expect(payments.refund).not.toHaveBeenCalled();
  });
});
