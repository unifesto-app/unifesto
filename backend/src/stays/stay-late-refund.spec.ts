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
    const svc = new StayBookingsService(prisma, {} as any, payments as any, {} as any, {} as any, {} as any, {} as any);
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
    expect(payments.refund).toHaveBeenCalledWith('pay_1', 1020, expect.any(String), expect.any(Object));
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

/** S51: the team cancel claims on the payment state it decided the refund from. */
describe('StayBookingsService.cancel claim', () => {
  it('conflicts instead of skipping a refund when a payment lands in between', async () => {
    const b = {
      id: 'b-1',
      userId: 'u-1',
      paymentMode: 'ONLINE',
      paymentStatus: PaymentStatus.PENDING,
      status: StayBookingStatus.AWAITING_PAYMENT,
      stay: { name: 'Hostel' },
    };
    const prisma: any = { stayBooking: { updateMany: jest.fn(async () => ({ count: 0 })) } };
    const payments = { refund: jest.fn() };
    const svc = new StayBookingsService(prisma, {} as any, payments as any, {} as any, {} as any, {} as any, {} as any);
    jest.spyOn(svc as any, 'loadForEvent').mockResolvedValue(b);
    await expect(svc.cancel('ev-1', 'b-1', 'u-1', { refund: true } as any)).rejects.toThrow(/just changed/);
    expect(prisma.stayBooking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'b-1', status: b.status, paymentStatus: b.paymentStatus, refundDueAt: null },
      }),
    );
    expect(payments.refund).not.toHaveBeenCalled();
  });
});

describe('stay notices also go by email (C9)', () => {
  it('emails the guest the same notice as the push, branded by the event', async () => {
    const prisma: any = {
      stayBooking: {
        findUnique: jest.fn(async () => ({
          eventId: 'ev-1',
          user: { fullName: 'Asha', username: null, identities: [{ email: 'asha@x.in' }] },
        })),
      },
    };
    const notifications = { send: jest.fn(async () => undefined) };
    const email = { sendStayUpdate: jest.fn(async () => undefined) };
    const svc = new StayBookingsService(prisma, {} as any, {} as any, notifications as any, {} as any, {} as any, email as any);
    (svc as any).notify('u-1', 'b-1', 'Stay request approved', 'Pay ₹500 by 2 Dec to confirm your bed at Hostel.');
    await new Promise((r) => setImmediate(r));
    expect(notifications.send).toHaveBeenCalledWith(['u-1'], expect.objectContaining({ title: 'Stay request approved' }));
    expect(email.sendStayUpdate).toHaveBeenCalledWith({
      email: 'asha@x.in',
      eventId: 'ev-1',
      userName: 'Asha',
      title: 'Stay request approved',
      body: 'Pay ₹500 by 2 Dec to confirm your bed at Hostel.',
    });
  });
});
