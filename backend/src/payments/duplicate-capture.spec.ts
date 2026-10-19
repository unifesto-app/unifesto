import { PaymentStatus, RegistrationStatus, StayBookingStatus } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { buildRegistrationsService } from '../registrations/registrations.testing';
import { StayBookingsService } from '../stays/stay-bookings.service';
import { SessionsService } from '../sessions/sessions.service';
import { TeamChangesService } from '../registrations/team-changes.service';

jest.mock('../registrations/form-answers.policy', () => ({
  enforceFormAnswers: jest.fn(async () => undefined),
}));

/**
 * A22: a second capture on a row another payment already paid (two tabs on one
 * waiting list offer, one stay, one seat add-on) is refunded in full, once.
 * The same payment replayed stays a no-op.
 */
describe('PaymentsService.refundIfDuplicate', () => {
  const build = (payment: Record<string, unknown> = {}) => {
    const svc = new PaymentsService({} as any);
    const rp = {
      payments: {
        fetch: jest.fn(async () => ({ id: 'pay_2', status: 'captured', amount: 105000, amount_refunded: 0, ...payment })),
        fetchMultipleRefund: jest.fn(async (): Promise<any> => ({ items: [] })),
        refund: jest.fn(async () => ({ id: 'rfnd_1' })),
      },
    };
    (svc as any).razorpay = rp;
    return { svc, rp };
  };

  it('does nothing for the same payment replayed or a row nobody paid', async () => {
    const { svc, rp } = build();
    await svc.refundIfDuplicate('pay_2', 'pay_2', 'registration r');
    await svc.refundIfDuplicate(null, 'pay_2', 'registration r');
    expect(rp.payments.fetch).not.toHaveBeenCalled();
  });

  it('refunds all of a different payment, fee included, under one key', async () => {
    const { svc, rp } = build();
    await svc.refundIfDuplicate('pay_1', 'pay_2', 'registration r');
    expect(rp.payments.refund).toHaveBeenCalledWith('pay_2', {
      amount: 105000,
      notes: expect.objectContaining({ refundKey: 'dup:pay_2', reason: 'duplicate_capture' }),
    });
  });

  it('a retry finds the keyed refund instead of sending a second', async () => {
    const { svc, rp } = build();
    rp.payments.fetchMultipleRefund.mockResolvedValue({
      items: [{ id: 'rfnd_1', amount: 105000, status: 'processed', notes: { refundKey: 'dup:pay_2' } }],
    });
    await svc.refundIfDuplicate('pay_1', 'pay_2', 'registration r');
    expect(rp.payments.refund).not.toHaveBeenCalled();
  });

  it('skips a payment already refunded in full or never captured', async () => {
    for (const p of [{ status: 'refunded', amount_refunded: 105000 }, { status: 'authorized' }]) {
      const { svc, rp } = build(p);
      await svc.refundIfDuplicate('pay_1', 'pay_2', 'registration r');
      expect(rp.payments.refund).not.toHaveBeenCalled();
    }
  });

  it('throws on a gateway outage (so the webhook retries) but not on a refusal', async () => {
    const down = build();
    down.rp.payments.refund.mockRejectedValue(new Error('timeout'));
    await expect(down.svc.refundIfDuplicate('pay_1', 'pay_2', 'r')).rejects.toThrow('timeout');

    const refused = build();
    refused.rp.payments.refund.mockRejectedValue({ statusCode: 400, error: { description: 'nope' } });
    await expect(refused.svc.refundIfDuplicate('pay_1', 'pay_2', 'r')).resolves.toBeUndefined();
  });
});

describe('event registrations refund a duplicate capture (A22)', () => {
  const row = {
    id: 'reg-1',
    eventId: 'event-1',
    userId: 'user-1',
    orderId: 'order_2',
    paymentId: 'pay_1',
    paymentStatus: PaymentStatus.PAID,
    status: RegistrationStatus.REGISTERED,
    waitlistStatus: null,
    razorpayAmount: 1050,
    qrCode: 'qr',
  };
  const build = () => {
    const prisma: any = {
      eventRegistration: {
        findUnique: jest.fn(async () => row),
        findFirst: jest.fn(async () => ({ id: 'reg-1' })),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      eventTicket: { findMany: jest.fn(async () => []) },
      webhookEvent: { findUnique: jest.fn(async () => null), createMany: jest.fn(async () => ({ count: 1 })) },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const payments = {
      verifyPaymentSignature: jest.fn(() => true),
      verifyWebhookSignature: jest.fn(() => true),
      fetchOrderNotes: jest.fn(async () => ({})),
      refundIfDuplicate: jest.fn(async () => undefined),
    };
    const svc = buildRegistrationsService(
      prisma, {} as any, {} as any, { redis: { getClient: () => null } } as any, {} as any, {} as any,
      payments as any, { convert: jest.fn() } as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, { can: async () => true } as any,
    );
    return { svc, prisma, payments };
  };
  const captured = (id: string) =>
    JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id, order_id: 'order_2', amount: 105000, currency: 'INR' } } },
    });

  it('the webhook for a second payment on a PAID row refunds it', async () => {
    const { svc, payments } = build();
    await svc.handleRazorpayWebhook(captured('pay_2'), 'sig', 'evt_1');
    expect(payments.refundIfDuplicate).toHaveBeenCalledWith('pay_1', 'pay_2', 'registration reg-1');
  });

  it('a webhook refund that fails transiently is not marked processed, so Razorpay retries', async () => {
    const { svc, prisma, payments } = build();
    payments.refundIfDuplicate.mockRejectedValueOnce(new Error('timeout'));
    await expect(svc.handleRazorpayWebhook(captured('pay_2'), 'sig', 'evt_1')).rejects.toThrow('timeout');
    expect(prisma.webhookEvent.createMany).not.toHaveBeenCalled();
  });

  it("the second tab's verify refunds its payment but still confirms the registration", async () => {
    const { svc, payments } = build();
    payments.refundIfDuplicate.mockRejectedValueOnce(new Error('timeout')); // never fails the payer
    await expect(
      svc.verifyPayment('event-1', 'user-1', {
        registrationId: 'reg-1',
        razorpayOrderId: 'order_2',
        razorpayPaymentId: 'pay_2',
        razorpaySignature: 'sig',
      } as any),
    ).resolves.toMatchObject({ registrationId: 'reg-1' });
    expect(payments.refundIfDuplicate).toHaveBeenCalledWith('pay_1', 'pay_2', 'registration reg-1');
  });

  it('a waiting list offer converted by another payment refunds this one', async () => {
    const { svc, prisma, payments } = build();
    prisma.eventRegistration.findUnique
      .mockResolvedValueOnce({ ...row, paymentStatus: PaymentStatus.PENDING, paymentId: null, waitlistStatus: 'OFFERED', event: {}, user: {} })
      .mockResolvedValue(row);
    (svc.settlement as any).waitlist.convert.mockResolvedValue({ converted: false });
    await (svc.settlement as any).completeWebhookPayment('reg-1', 'pay_2', 'order_2');
    expect(payments.refundIfDuplicate).toHaveBeenCalledWith('pay_1', 'pay_2', 'registration reg-1');
  });

  it('a REFUNDED row is left to orphaned payments (it may be a re-registration)', async () => {
    const { svc, prisma, payments } = build();
    prisma.eventRegistration.findUnique.mockResolvedValue({ ...row, paymentStatus: PaymentStatus.REFUNDED });
    await (svc.settlement as any).refundIfDuplicate('reg-1', 'pay_2');
    expect(payments.refundIfDuplicate).not.toHaveBeenCalled();
  });
});

describe('stays refund a duplicate capture (A22)', () => {
  const build = (fresh: Record<string, unknown>) => {
    const prisma: any = {
      $executeRaw: jest.fn(async () => 1),
      stayBooking: {
        findUniqueOrThrow: jest.fn(async () => ({ id: 'b-1', optionId: 'o-1', ...fresh })),
        update: jest.fn(async () => ({})),
      },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const payments = { refundIfDuplicate: jest.fn(async () => undefined) };
    const svc = new StayBookingsService(prisma, {} as any, payments as any, {} as any, {} as any, {} as any);
    jest.spyOn(svc as any, 'notify').mockImplementation(() => undefined);
    return { svc, prisma, payments };
  };

  it('a second payment on a paid stay goes back; the booking is untouched', async () => {
    const { svc, prisma, payments } = build({ paymentStatus: PaymentStatus.PAID, paymentId: 'pay_1', status: StayBookingStatus.CONFIRMED });
    await (svc as any).settle('b-1', 'pay_2', 'order_2');
    expect(payments.refundIfDuplicate).toHaveBeenCalledWith('pay_1', 'pay_2', 'stay booking b-1');
    expect(prisma.stayBooking.update).not.toHaveBeenCalled();
  });

  it("a failed refund doesn't fail the payer's verify, but does fail the webhook", async () => {
    const paid = { paymentStatus: PaymentStatus.PAID, paymentId: 'pay_1' };
    const client = build(paid);
    client.payments.refundIfDuplicate.mockRejectedValue(new Error('timeout'));
    await expect((client.svc as any).settle('b-1', 'pay_2', 'order_2', true)).resolves.toBeUndefined();
    const hook = build(paid);
    hook.payments.refundIfDuplicate.mockRejectedValue(new Error('timeout'));
    await expect((hook.svc as any).settle('b-1', 'pay_2', 'order_2')).rejects.toThrow('timeout');
  });
});

describe('sessions refund a duplicate capture (A22)', () => {
  const paid = { id: 'sr-1', sessionId: 's-1', userId: 'u-1', orderId: 'order_2', paymentId: 'pay_1', paymentStatus: PaymentStatus.PAID, status: RegistrationStatus.REGISTERED };
  const build = () => {
    const prisma: any = {
      sessionRegistration: {
        findFirst: jest.fn(async () => paid),
        findUnique: jest.fn(async () => paid),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const payments = { verifyPaymentSignature: jest.fn(() => true), refundIfDuplicate: jest.fn(async () => undefined) };
    const svc = new SessionsService(prisma, payments as any, {} as any, {} as any, {} as any, {} as any);
    return { svc, payments };
  };

  it('the webhook refunds a second payment on a paid session seat', async () => {
    const { svc, payments } = build();
    await expect(svc.completeFromWebhook('order_2', 'pay_2', { amount: 0, currency: 'INR' })).resolves.toBe(true);
    expect(payments.refundIfDuplicate).toHaveBeenCalledWith('pay_1', 'pay_2', 'session registration sr-1');
  });

  it('verify does too, and the same payment replayed passes through as a no-op', async () => {
    const { svc, payments } = build();
    const verify = (id: string) =>
      svc.verifyPayment('u-1', { registrationId: 'sr-1', razorpayOrderId: 'order_2', razorpayPaymentId: id, razorpaySignature: 's' } as any);
    await verify('pay_2');
    await verify('pay_1');
    expect(payments.refundIfDuplicate.mock.calls).toEqual([
      ['pay_1', 'pay_2', 'session registration sr-1'],
      ['pay_1', 'pay_1', 'session registration sr-1'],
    ]);
  });
});

describe('seat add-ons refund a duplicate capture (A22)', () => {
  it('a second payment on a paid purchase goes back', async () => {
    const purchase = { id: 'gp-1', userId: 'u-1', registrationId: 'r-1', seats: 2, paymentId: 'pay_1', paymentStatus: PaymentStatus.PAID, registration: { event: { title: 'Hack' } } };
    const prisma: any = {
      groupSeatPurchase: {
        updateMany: jest.fn(async () => ({ count: 0 })),
        findUniqueOrThrow: jest.fn(async () => purchase),
      },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const payments = { refundIfDuplicate: jest.fn(async () => undefined) };
    const svc = new TeamChangesService(prisma, {} as any, payments as any, {} as any, {} as any);
    await expect((svc as any).settle('gp-1', 'pay_2')).resolves.toMatchObject({ outcome: 'already' });
    expect(payments.refundIfDuplicate).toHaveBeenCalledWith('pay_1', 'pay_2', 'seat purchase gp-1');
  });
});
