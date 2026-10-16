import { BadRequestException, ConflictException } from '@nestjs/common';
import { PaymentStatus, Prisma, RegistrationStatus } from '@prisma/client';
import { RegistrationsService } from './registrations.service';
import { buildRegistrationsService } from './registrations.testing';
import { CouponsService } from '../coupons/coupons.service';
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
  const svc = buildRegistrationsService(
    prisma, { sendCancellationConfirmation: jest.fn() } as any, {} as any, cache as any, {} as any, {} as any,
    payments as any, { convert: jest.fn() } as any, { emit: jest.fn() } as any, groupSeats as any, {} as any,
    coupons as any, {} as any, {} as any, { can: async () => true } as any,
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

describe('after a sold-out refund (S10)', () => {
  it('a retried verify does not report a confirmed spot', async () => {
    const { svc, prisma } = build({
      row: row({
        status: RegistrationStatus.CANCELLED,
        refundDueAt: new Date(),
        razorpayAmount: 510,
        cancellationReason: 'Sold out while the payment was in progress; refunded in full',
      }),
    });
    await expect(
      svc.verifyPayment('event-1', 'user-1', {
        registrationId: 'reg-1',
        razorpayOrderId: 'order_1',
        razorpayPaymentId: 'pay_1',
        razorpaySignature: 'sig',
      } as any),
    ).rejects.toThrow(/sold out/);
    expect(prisma.eventTicket.findMany).not.toHaveBeenCalled();
  });

  it('the retry job only picks rows whose money is still held', async () => {
    const { svc, prisma } = build();
    await svc.retryDueRefunds();
    expect(prisma.eventRegistration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ paymentStatus: PaymentStatus.PAID }),
      }),
    );
  });
});

describe('settling a cancelled checkout (S9 / S15)', () => {
  it('records the money but takes no seats and issues no tickets', async () => {
    const { svc, prisma } = build({
      row: row({ status: RegistrationStatus.CANCELLED, paymentStatus: PaymentStatus.PENDING, razorpayAmount: 510 }),
    });
    await expect((svc as any).completeWebhookPayment('reg-1', 'pay_1', 'order_1')).resolves.toBe('cancelled');
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.event.update).not.toHaveBeenCalled();
    expect(prisma.eventTicket.create).not.toHaveBeenCalled();
  });
});

/* ---------------------------------------------------------------------------
 * S45: the races and the end-to-end flow on top of the per-guard tests above.
 * ------------------------------------------------------------------------- */

const verifyDto = {
  registrationId: 'reg-1',
  razorpayOrderId: 'order_1',
  razorpayPaymentId: 'pay_1',
  razorpaySignature: 'sig',
} as any;
const pending = () =>
  row({ paymentStatus: PaymentStatus.PENDING, totalAmount: 510, razorpayAmount: 510, processingFee: 10 });

describe('verify vs webhook race (S45)', () => {
  it('both settle the same payment: seats, tickets and coupon move once', async () => {
    const { svc, prisma, coupons } = build({ row: pending() });
    // Both read the row as PENDING; only the first conditional claim wins.
    prisma.eventRegistration.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await svc.verifyPayment('event-1', 'user-1', verifyDto).catch(() => undefined);
    await expect((svc as any).completeWebhookPayment('reg-1', 'pay_1', 'order_1')).resolves.toBeUndefined();

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1); // one seat take
    expect(prisma.event.update).toHaveBeenCalledTimes(1); // one attendee count
    expect(prisma.eventTicket.create).toHaveBeenCalledTimes(1);
    expect(coupons.confirmByRegistration).toHaveBeenCalledTimes(1);
  });

  it('webhook first, verify second: verify returns success and settles nothing', async () => {
    const { svc, prisma } = build({ row: pending() });
    prisma.eventRegistration.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await (svc as any).completeWebhookPayment('reg-1', 'pay_1', 'order_1').catch(() => undefined);
    const res = await svc.verifyPayment('event-1', 'user-1', verifyDto);

    expect(res.message).toMatch(/verified/);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.eventTicket.create).toHaveBeenCalledTimes(1);
  });
});

describe('waitlist convert race (S52)', () => {
  const offered = () => row({ paymentStatus: PaymentStatus.PENDING, waitlistStatus: 'OFFERED', razorpayAmount: 510 });

  it.each([
    ['verify', (svc: any) => svc.verifyPayment('event-1', 'user-1', verifyDto)],
    ['webhook', (svc: any) => svc.completeWebhookPayment('reg-1', 'pay_1', 'order_1')],
  ])('the losing %s sends no second confirmation', async (_name, call) => {
    const { svc } = build({ row: offered() });
    (svc as any).waitlist.convert = jest.fn(async () => ({ registration: offered(), converted: false }));
    (svc as any).cache.incrementEventScore = jest.fn(async () => undefined);
    const confirm = jest.spyOn(svc.confirmations, 'sendRegistrationConfirmations').mockResolvedValue(undefined);
    await call(svc);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('the winner confirms once', async () => {
    const { svc } = build({ row: offered() });
    (svc as any).waitlist.convert = jest.fn(async () => ({ registration: offered(), converted: true }));
    (svc as any).cache.incrementEventScore = jest.fn(async () => undefined);
    const confirm = jest.spyOn(svc.confirmations, 'sendRegistrationConfirmations').mockResolvedValue(undefined);
    await svc.verifyPayment('event-1', 'user-1', verifyDto);
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});

describe('transfer request race (S52)', () => {
  it('a second concurrent request hits the one-pending index and is a 409', async () => {
    const { svc, prisma } = build({ row: row() });
    jest.spyOn(svc as any, 'assertEventOrganiser').mockResolvedValue(undefined);
    prisma.registrationTransferRequest.findFirst = jest.fn(async () => null); // both see none
    prisma.registrationTransferRequest.create = jest.fn(async () => {
      throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '6' });
    });
    await expect(
      svc.requestRegistrationTransfer('curator', 'event-1', 'reg-1', 'b@x.in'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('coupon cap at checkout (S45)', () => {
  /** A real CouponsService on the same mock, so the soft read and the hard reserve both run. */
  function checkout(slotsLeft: number) {
    const ctx = build();
    const { prisma } = ctx;
    prisma.$executeRaw = jest.fn(async () => (slotsLeft-- > 0 ? 1 : 0));
    prisma.event.findUnique = jest.fn(async () => ({
      id: 'event-1',
      spaceId: 'space-1',
      visibility: 'PUBLIC',
      status: 'PUBLISHED',
      isRecurring: false,
      registrations: [],
      ticketTypes: [
        { id: 'tt-1', kind: 'INDIVIDUAL', price: 500, isActive: true, isVisible: true, totalQuantity: 10, soldCount: 0, perUserLimit: 5 },
      ],
    }));
    prisma.ticketTypeBlock = { findMany: jest.fn(async () => []) };
    prisma.eventCoupon = {
      findUnique: jest.fn(async () => ({
        id: 'c-1', code: 'LAST', isActive: true, appliesToTicketTypeIds: [], usageLimit: 1, usedCount: 0,
        perUserLimit: 1, discountType: 'FLAT', discountValue: 100, maxDiscountAmount: null, minPurchaseAmount: null,
      })),
    };
    prisma.couponRedemption = { count: jest.fn(async () => 0), create: jest.fn(async () => ({})) };
    (ctx.payments as any).computeProcessingFee = () => 10;
    (ctx.payments as any).createOrder = jest.fn(async () => ({ orderId: 'order_x' }));
    const real = new CouponsService(prisma);
    (ctx.svc as any).coupons = real;
    return { ...ctx, real };
  }
  const dto = { ticketTypeId: 'tt-1', quantity: 1, couponCode: 'last' } as any;

  it('two buyers who both passed the soft check: the second is refused, no Razorpay order', async () => {
    const a = checkout(1);
    await a.svc.createPaymentOrder('event-1', 'user-1', dto);
    expect((a.payments as any).createOrder).toHaveBeenCalledTimes(1);

    const b = checkout(0); // the slot is gone by the time the second reserves
    await expect(b.svc.createPaymentOrder('event-1', 'user-2', dto)).rejects.toThrow(/usage limit/);
    expect((b.payments as any).createOrder).not.toHaveBeenCalled();
  });
});

describe('register → pay → cancel (S45 flow)', () => {
  it('once paid, the ticket cannot be cancelled around the refund flow', async () => {
    // Pay: the claim settles the PENDING row.
    const state: any = pending();
    const { svc, prisma } = build({ row: state });
    prisma.eventRegistration.updateMany.mockImplementationOnce(async ({ data }: any) => {
      Object.assign(state, data);
      return { count: 1 };
    });
    await svc.verifyPayment('event-1', 'user-1', verifyDto).catch(() => undefined);
    expect(state.paymentStatus).toBe(PaymentStatus.PAID);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);

    // Cancel: a paid ticket must go through refunds, and gives no seat back here.
    prisma.event.update.mockClear();
    await expect(svc.cancelMyRegistration('reg-1', 'user-1')).rejects.toThrow(/refund request/);
    expect(prisma.event.update).not.toHaveBeenCalled();
    expect(prisma.eventTicketType.update).not.toHaveBeenCalled();
  });
});
