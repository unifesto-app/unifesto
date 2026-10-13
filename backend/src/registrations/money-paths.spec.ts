import { BadRequestException } from '@nestjs/common';
import { PaymentStatus, RegistrationStatus } from '@prisma/client';
import { RegistrationsService } from './registrations.service';
import { SoldOutError, takeSeats } from './capacity.util';

jest.mock('./form-answers.policy', () => ({
  enforceFormAnswers: jest.fn(async () => undefined),
}));

/**
 * S9 / S10 / S15 money paths: what a cancel releases, atomic capacity with a
 * full refund when a paid ticket sold out mid-payment, restore guards, the
 * `payment.failed` downgrade, and the transfer-review claim.
 */

/** A conditional seat take that succeeds `seatsLeft` times, then reports sold out. */
function build(opts: { row?: any; seatsLeft?: number; updateManyCount?: number } = {}) {
  let seatsLeft = opts.seatsLeft ?? 100;
  const prisma: any = {
    $executeRaw: jest.fn(async (_sql: TemplateStringsArray, n: number) => {
      if (seatsLeft < n) return 0;
      seatsLeft -= n;
      return 1;
    }),
    eventRegistration: {
      findUnique: jest.fn(async () => opts.row ?? null),
      findUniqueOrThrow: jest.fn(async () => opts.row ?? null),
      findFirst: jest.fn(async () => opts.row ?? null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: any) => ({ id: 'reg-new', quantity: 1, groupSize: null, ...data })),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: opts.updateManyCount ?? 1 })),
    },
    event: { update: jest.fn(async () => ({})) },
    eventTicketType: { update: jest.fn(async () => ({})) },
    eventTicket: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 0 })),
      count: jest.fn(async () => 1),
    },
    userIdentity: { findFirst: jest.fn(async () => null) },
    registrationTransferRequest: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: opts.updateManyCount ?? 1 })),
    },
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  const payments = {
    verifyPaymentSignature: jest.fn(() => true),
    fetchOrderNotes: jest.fn(async () => ({})),
    refund: jest.fn(async () => undefined),
  };
  const coupons = {
    releaseByRegistration: jest.fn(async () => undefined),
    confirmByRegistration: jest.fn(async () => undefined),
  };
  const cache = {
    invalidateCheckinCache: jest.fn(async () => undefined),
    redis: { getClient: () => null },
  };
  const groupSeats = {
    createSeatsForRegistration: jest.fn(async () => undefined),
    notifyGroupCancelled: jest.fn(async () => undefined),
  };
  const svc = new RegistrationsService(
    prisma, { sendCancellationConfirmation: jest.fn() } as any, {} as any, cache as any, {} as any, {} as any,
    payments as any, { convert: jest.fn() } as any, { emit: jest.fn() } as any, groupSeats as any, {} as any,
    coupons as any, {} as any, {} as any,
  );
  return { svc, prisma, payments, coupons };
}

const future = new Date(Date.now() + 86_400_000);
const row = (over: Record<string, unknown> = {}) => ({
  id: 'reg-1',
  eventId: 'event-1',
  userId: 'user-1',
  ticketTypeId: 'tt-1',
  quantity: 1,
  groupSize: null,
  orderId: 'order_1',
  paymentId: null,
  totalAmount: 0,
  razorpayAmount: 0,
  processingFee: 0,
  paymentStatus: PaymentStatus.PAID,
  status: RegistrationStatus.REGISTERED,
  waitlistStatus: null,
  isWaitlisted: false,
  refundDueAt: null,
  qrCode: 'qr',
  groupMembers: null,
  event: { id: 'event-1', title: 'Fest', slug: 'fest', startDateTime: future, endDateTime: future },
  user: { fullName: 'A', username: 'a', mobileNumber: null },
  ...over,
});

describe('takeSeats (S10)', () => {
  it('takes atomically and counts the attendee', async () => {
    const { prisma } = build({ seatsLeft: 2 });
    await takeSeats(prisma, { eventId: 'event-1', ticketTypeId: 'tt-1' }, 2);
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: { registeredCount: { increment: 2 } },
    });
  });

  it('refuses rather than oversells, and counts nothing', async () => {
    const { prisma } = build({ seatsLeft: 1 });
    await expect(takeSeats(prisma, { eventId: 'event-1', ticketTypeId: 'tt-1' }, 2)).rejects.toBeInstanceOf(SoldOutError);
    expect(prisma.event.update).not.toHaveBeenCalled();
  });
});

describe('cancel (S9)', () => {
  it('an unpaid PENDING checkout releases no seats, only its coupon', async () => {
    const { svc, prisma, coupons } = build({
      row: row({ paymentStatus: PaymentStatus.PENDING, totalAmount: 500, razorpayAmount: 500 }),
    });
    await svc.cancelMyRegistration('reg-1', 'user-1');
    expect(prisma.event.update).not.toHaveBeenCalled();
    expect(prisma.eventTicketType.update).not.toHaveBeenCalled();
    expect(coupons.releaseByRegistration).toHaveBeenCalledWith(prisma, 'reg-1');
  });

  it('a free confirmed registration gives its seat back', async () => {
    const { svc, prisma } = build({ row: row() });
    await svc.cancelMyRegistration('reg-1', 'user-1');
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: { registeredCount: { decrement: 1 } },
    });
    expect(prisma.eventTicketType.update).toHaveBeenCalledWith({
      where: { id: 'tt-1' },
      data: { soldCount: { decrement: 1 } },
    });
  });

  it('a concurrent second cancel releases nothing', async () => {
    const { svc, prisma } = build({ row: row(), updateManyCount: 0 });
    await expect(svc.cancelMyRegistration('reg-1', 'user-1')).rejects.toThrow(/already cancelled/);
    expect(prisma.event.update).not.toHaveBeenCalled();
  });
});

describe('paid ticket sold out mid-payment (S10)', () => {
  const paid = () =>
    row({
      paymentStatus: PaymentStatus.PENDING,
      totalAmount: 510,
      razorpayAmount: 510,
      processingFee: 10,
    });

  it('verify cancels the row, frees the coupon and refunds everything paid', async () => {
    const { svc, prisma, payments, coupons } = build({ row: paid(), seatsLeft: 0 });
    // After the claim, refundDue reads the captured payment back.
    prisma.eventRegistration.findUniqueOrThrow.mockResolvedValue({ paymentId: 'pay_1', razorpayAmount: 510 });
    await expect(
      svc.verifyPayment('event-1', 'user-1', {
        registrationId: 'reg-1',
        razorpayOrderId: 'order_1',
        razorpayPaymentId: 'pay_1',
        razorpaySignature: 'sig',
      } as any),
    ).rejects.toThrow(/sold out/);

    expect(prisma.eventRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: RegistrationStatus.CANCELLED, refundDueAt: expect.any(Date) }),
      }),
    );
    expect(coupons.releaseByRegistration).toHaveBeenCalled();
    expect(coupons.confirmByRegistration).not.toHaveBeenCalled();
    expect(prisma.event.update).not.toHaveBeenCalled();
    expect(prisma.eventTicket.create).not.toHaveBeenCalled();
    expect(payments.refund).toHaveBeenCalledWith('pay_1', 510);
    expect(prisma.eventRegistration.update).toHaveBeenLastCalledWith({
      where: { id: 'reg-1' },
      data: expect.objectContaining({ paymentStatus: PaymentStatus.REFUNDED, refundDueAt: null }),
    });
  });

  it('verify with a seat left confirms as before', async () => {
    const { svc, prisma, payments, coupons } = build({ row: paid(), seatsLeft: 1 });
    await svc.verifyPayment('event-1', 'user-1', {
      registrationId: 'reg-1',
      razorpayOrderId: 'order_1',
      razorpayPaymentId: 'pay_1',
      razorpaySignature: 'sig',
    } as any).catch(() => undefined); // notifications past the money path aren't mocked
    expect(coupons.confirmByRegistration).toHaveBeenCalled();
    expect(prisma.eventTicket.create).toHaveBeenCalledTimes(1);
    expect(payments.refund).not.toHaveBeenCalled();
  });

  it('a failed refund stays due for the retry job and is never sent twice', async () => {
    const { svc, prisma, payments } = build();
    prisma.eventRegistration.findUniqueOrThrow.mockResolvedValue({ paymentId: 'pay_1', razorpayAmount: 510 });
    payments.refund.mockRejectedValueOnce(new Error('gateway down'));
    await expect(svc.refundDue('reg-1')).resolves.toBe(false);
    expect(prisma.eventRegistration.update).not.toHaveBeenCalled();

    // Another replica already claimed it: no second refund.
    prisma.eventRegistration.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.refundDue('reg-1')).resolves.toBe(false);
    expect(payments.refund).toHaveBeenCalledTimes(1);
  });
});

describe('free RSVP (S10)', () => {
  it('cannot take the last seat twice', async () => {
    const { svc, prisma } = build({ seatsLeft: 0 });
    await expect(
      svc.completeRSVP('user-1', 'event-1', { ticketTypeId: 'tt-1', quantity: 1 } as any, {}),
    ).rejects.toBeInstanceOf(SoldOutError);
    expect(prisma.eventTicket.create).not.toHaveBeenCalled();
  });
});

describe('restore (S10 / S15)', () => {
  it.each([PaymentStatus.REFUNDED, PaymentStatus.PENDING, PaymentStatus.FAILED])(
    'never revives a %s row',
    async (paymentStatus) => {
      const { svc, prisma } = build();
      prisma.eventRegistration.findFirst
        .mockResolvedValueOnce(row({ status: RegistrationStatus.CANCELLED, paymentStatus }))
        .mockResolvedValueOnce(null); // no clashing live registration
      await expect(svc.restoreRegistration('admin', 'event-1', 'reg-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('re-takes seats atomically and refuses when sold out', async () => {
    const cancelled = row({ status: RegistrationStatus.CANCELLED });
    const { svc, prisma } = build({ seatsLeft: 0 });
    prisma.eventRegistration.findFirst.mockResolvedValueOnce(cancelled).mockResolvedValueOnce(null);
    await expect(svc.restoreRegistration('admin', 'event-1', 'reg-1')).rejects.toThrow(/capacity/);
    expect(prisma.event.update).not.toHaveBeenCalled();
  });
});

describe('payment.failed (S15)', () => {
  it('never downgrades a row that a capture already made PAID', async () => {
    const { svc, prisma } = build({ updateManyCount: 0 });
    await (svc as any).markRegistrationFailed({
      id: 'reg-1',
      razorpayAmount: 510,
      event: { id: 'event-1', title: 'Fest', slug: 'fest' },
      user: { fullName: 'A', username: 'a', identities: [{ email: 'a@x.in' }] },
    });
    expect(prisma.eventRegistration.updateMany).toHaveBeenCalledWith({
      where: { id: 'reg-1', paymentStatus: PaymentStatus.PENDING },
      data: { paymentStatus: PaymentStatus.FAILED },
    });
    expect(prisma.eventRegistration.update).not.toHaveBeenCalled();
  });
});

describe('transfer review (S15)', () => {
  it('a request another admin already reviewed moves nothing', async () => {
    const { svc, prisma } = build({ updateManyCount: 0 });
    prisma.registrationTransferRequest.findUnique.mockResolvedValue({
      id: 'req-1',
      status: 'PENDING',
      targetEmail: 'b@x.in',
      registration: { id: 'reg-1', eventId: 'event-1', userId: 'user-1', ticketTypeId: 'tt-1' },
    });
    await expect(svc.reviewTransferRequest('req-1', 'admin', 'APPROVED')).rejects.toThrow(/already been reviewed/);
    expect(prisma.userIdentity.findFirst).not.toHaveBeenCalled();
    expect(prisma.eventRegistration.updateMany).not.toHaveBeenCalled();
  });
});
