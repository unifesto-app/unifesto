import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentStatus, RegistrationStatus } from '@prisma/client';
import { RegistrationsService } from './registrations.service';
import { RegistrationPaymentsService } from './registration-payments.service';
import { buildRegistrationsService } from './registrations.testing';
import { capturedAmountMatches } from '../payments/payments.service';

jest.mock('./form-answers.policy', () => ({
  enforceFormAnswers: jest.fn(async () => undefined),
}));

/**
 * S1 / S13 / S28: a signed Razorpay receipt proves *a* payment, not that it
 * paid for this row. These pin the guards that stop one cheap receipt from
 * confirming other registrations, reviving refunded/cancelled ones, double-
 * processing a redelivered webhook, or orphaning money on checkout retry.
 */
describe('RegistrationsService payment replay guards', () => {
  const EVENT = 'event-1';
  const USER = 'user-1';
  const sig = { verifyPaymentSignature: jest.fn(() => true) };

  const reg = (over: Record<string, unknown> = {}) => ({
    id: 'reg-1',
    eventId: EVENT,
    userId: USER,
    orderId: 'order_current',
    paymentStatus: PaymentStatus.PENDING,
    status: RegistrationStatus.REGISTERED,
    waitlistStatus: null,
    qrCode: 'qr',
    ...over,
  });

  const build = (opts: {
    row?: any;
    orderNotes?: Record<string, string>;
    eventRegs?: any[];
    webhookFresh?: boolean;
  }) => {
    const prisma: any = {
      eventRegistration: {
        findUnique: jest.fn(async () => opts.row ?? null),
        findFirst: jest.fn(async () => null),
        update: jest.fn(async () => ({})),
        delete: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      eventTicket: { findMany: jest.fn(async () => []) },
      sessionRegistration: { findFirst: jest.fn(async () => null) },
      event: {
        findUnique: jest.fn(async () => ({
          id: EVENT,
          status: 'PUBLISHED',
          isRecurring: false,
          ticketTypes: [],
          registrations: opts.eventRegs ?? [],
        })),
      },
      webhookEvent: {
        findUnique: jest.fn(async () => (opts.webhookFresh === false ? { id: 'seen' } : null)),
        createMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const payments = {
      ...sig,
      verifyWebhookSignature: jest.fn(() => true),
      fetchOrderNotes: jest.fn(async () => opts.orderNotes ?? {}),
    };
    const coupons = { releaseByRegistration: jest.fn(async () => undefined) };
    const waitlist = { convert: jest.fn() };
    const svc = buildRegistrationsService(
      prisma, {} as any, {} as any, { redis: { getClient: () => null } } as any, {} as any, {} as any,
      payments as any, waitlist as any, {} as any, {} as any, {} as any,
      coupons as any, { completeFromWebhook: jest.fn(async () => false) } as any,
      { completeFromWebhook: jest.fn(async () => false) } as any, { can: async () => true } as any,
    );
    return { svc, prisma, payments };
  };

  const verify = (svc: RegistrationsService, orderId: string, eventId = EVENT) =>
    svc.verifyPayment(eventId, USER, {
      registrationId: 'reg-1',
      razorpayOrderId: orderId,
      razorpayPaymentId: 'pay_cheap',
      razorpaySignature: 'sig',
    } as any);

  describe('verifyPayment (S1)', () => {
    it('rejects a receipt for an order that is not this registration\'s', async () => {
      const { svc, prisma } = build({ row: reg(), orderNotes: { registrationId: 'other-reg' } });
      await expect(verify(svc, 'order_cheap')).rejects.toThrow(/different order/);
      expect(prisma.eventRegistration.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a foreign receipt on a waiting-list offer too', async () => {
      const { svc, prisma } = build({
        row: reg({ waitlistStatus: 'OFFERED' }),
        orderNotes: { registrationId: 'other-reg' },
      });
      await expect(verify(svc, 'order_cheap')).rejects.toThrow(/different order/);
      expect((svc.settlement as any).waitlist.convert).not.toHaveBeenCalled();
      expect(prisma.eventRegistration.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a registration from a different event', async () => {
      const { svc } = build({ row: reg({ eventId: 'event-2' }) });
      await expect(verify(svc, 'order_current')).rejects.toThrow(/different event/);
    });

    it('accepts an earlier order a retry replaced when its notes name the row', async () => {
      const { svc } = build({
        row: reg({ paymentStatus: PaymentStatus.PAID }),
        orderNotes: { registrationId: 'reg-1' },
      });
      await expect(verify(svc, 'order_earlier')).resolves.toMatchObject({ registrationId: 'reg-1' });
    });

    it.each([
      [PaymentStatus.REFUNDED, RegistrationStatus.CANCELLED],
      [PaymentStatus.PARTIALLY_REFUNDED, RegistrationStatus.REGISTERED],
      [PaymentStatus.PENDING, RegistrationStatus.CANCELLED],
    ])('never revives a %s / %s row with its original receipt', async (paymentStatus, status) => {
      const { svc, prisma } = build({ row: reg({ paymentStatus, status }) });
      await expect(verify(svc, 'order_current')).rejects.toThrow(BadRequestException);
      expect(prisma.eventRegistration.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('Razorpay webhook (S28)', () => {
    const body = (event = 'payment.captured') =>
      JSON.stringify({
        event,
        payload: { payment: { entity: { id: 'pay_1', order_id: 'order_current', notes: {} } } },
      });

    it('acknowledges a redelivered event id without processing it again', async () => {
      const { svc, prisma } = build({ row: reg(), webhookFresh: false });
      await expect(svc.handleRazorpayWebhook(body(), 'sig', 'evt_1')).resolves.toEqual({ received: true });
      expect(prisma.eventRegistration.findFirst).not.toHaveBeenCalled();
    });

    it('does not settle a capture onto a cancelled registration', async () => {
      const { svc, prisma } = build({ row: reg({ status: RegistrationStatus.CANCELLED }) });
      prisma.eventRegistration.findFirst.mockResolvedValue({ id: 'reg-1' });
      const complete = jest.spyOn(svc.settlement as any, 'completeWebhookPayment');
      await svc.handleRazorpayWebhook(body(), 'sig', 'evt_2');
      expect(complete).not.toHaveBeenCalled();
    });

    it('records the event id only after processing succeeds', async () => {
      const { svc, prisma } = build({ row: reg() });
      prisma.eventRegistration.findFirst.mockRejectedValue(new Error('db down'));
      await expect(svc.handleRazorpayWebhook(body(), 'sig', 'evt_3')).rejects.toThrow('db down');
      expect(prisma.webhookEvent.createMany).not.toHaveBeenCalled();

      prisma.eventRegistration.findFirst.mockResolvedValue(null);
      await svc.handleRazorpayWebhook(body('payment.failed'), 'sig', 'evt_3');
      expect(prisma.webhookEvent.createMany).toHaveBeenCalledWith({
        data: [{ id: 'razorpay:evt_3', source: 'razorpay' }],
        skipDuplicates: true,
      });
    });
  });

  describe('Razorpay webhook trusts only server data (A13)', () => {
    const captured = (entity: Record<string, unknown>) =>
      JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_x', currency: 'INR', notes: {}, ...entity } } },
      });

    it('ignores buyer-set payment notes naming another registration', async () => {
      const { svc, prisma } = build({ row: reg({ razorpayAmount: 5000 }), orderNotes: {} });
      const complete = jest.spyOn(svc.settlement as any, 'completeWebhookPayment');
      await svc.handleRazorpayWebhook(
        captured({ order_id: 'order_session', amount: 100, notes: { registrationId: 'reg-1' } }),
        'sig',
        'evt_a',
      );
      expect(complete).not.toHaveBeenCalled();
      expect(prisma.eventRegistration.findUnique).not.toHaveBeenCalled();
    });

    it('does not settle when the captured amount differs from the registration', async () => {
      const { svc, prisma } = build({ row: reg({ razorpayAmount: 5000 }) });
      prisma.eventRegistration.findFirst.mockResolvedValue({ id: 'reg-1' });
      const complete = jest.spyOn(svc.settlement as any, 'completeWebhookPayment');
      await svc.handleRazorpayWebhook(captured({ order_id: 'order_current', amount: 100 }), 'sig', 'evt_b');
      expect(complete).not.toHaveBeenCalled();
    });

    it('settles when amount and currency match', async () => {
      const { svc, prisma } = build({ row: reg({ razorpayAmount: 5000 }) });
      prisma.eventRegistration.findFirst.mockResolvedValue({ id: 'reg-1' });
      const complete = jest
        .spyOn(svc.settlement as any, 'completeWebhookPayment')
        .mockResolvedValue(undefined);
      await svc.handleRazorpayWebhook(captured({ order_id: 'order_current', amount: 500000 }), 'sig', 'evt_c');
      expect(complete).toHaveBeenCalledWith('reg-1', 'pay_x', 'order_current');
    });

    it('capturedAmountMatches compares paise and requires INR', () => {
      expect(capturedAmountMatches({ amount: 52550, currency: 'INR' }, '525.50')).toBe(true);
      expect(capturedAmountMatches({ amount: 52550, currency: 'USD' }, 525.5)).toBe(false);
      expect(capturedAmountMatches({ amount: 100, currency: 'INR' }, 5000)).toBe(false);
    });
  });

  describe('refund.failed webhook (A15)', () => {
    const failed = (notes: Record<string, string>) =>
      JSON.stringify({
        event: 'refund.failed',
        payload: { refund: { entity: { id: 'rfnd_1', amount: 6000, payment_id: 'pay_1', notes } } },
      });

    it('reverses the refunded amount and notes the request, once per refund', async () => {
      const { svc, prisma } = build({});
      prisma.eventRegistration.update.mockResolvedValue({ id: 'reg-1', refundedAmount: 0 });
      prisma.refundRequest = {
        findUnique: jest.fn(async () => ({ adminNote: null, status: 'APPROVED' })),
        update: jest.fn(async () => ({})),
      };
      const sendRawEmail = jest.fn(async () => null);
      (svc.settlement as any).emailService.sendRawEmail = sendRawEmail;
      prisma.eventRegistration.findUnique = jest.fn(async () => ({ userId: 'u-1', event: { title: 'Fest' } }));
      prisma.userIdentity = { findFirst: jest.fn(async () => ({ email: 'a@x.in' })) };
      const notes = { registrationId: 'reg-1', refundRequestId: 'rr-1' };
      await svc.handleRazorpayWebhook(failed(notes), 'sig', 'evt_rf1');
      expect(prisma.eventRegistration.update).toHaveBeenCalledWith({
        where: { id: 'reg-1' },
        data: { refundedAmount: { decrement: 60 } },
      });
      expect(prisma.eventRegistration.update).toHaveBeenCalledWith({
        where: { id: 'reg-1' },
        data: { paymentStatus: PaymentStatus.PAID },
      });
      // Still owed: REFUND_FAILED, holding the failed amount (A25).
      expect(prisma.refundRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'REFUND_FAILED',
            adminNote: expect.stringContaining('rfnd_1'),
          }),
        }),
      );
      expect(String(prisma.refundRequest.update.mock.calls[0][0].data.requestedAmount)).toBe('60');
      // The attendee and the platform desk both hear about it.
      expect(sendRawEmail).toHaveBeenCalledWith('a@x.in', expect.stringContaining("didn't go through"), expect.any(String));
      expect(sendRawEmail).toHaveBeenCalledTimes(2);

      // A second delivery of the same refund changes nothing.
      prisma.webhookEvent.createMany.mockResolvedValueOnce({ count: 0 });
      prisma.eventRegistration.update.mockClear();
      await svc.handleRazorpayWebhook(failed(notes), 'sig', 'evt_rf2');
      expect(prisma.eventRegistration.update).not.toHaveBeenCalled();
    });

    it('changes no rows for a failed auto refund but tells the desk', async () => {
      const { svc, prisma } = build({});
      const sendRawEmail = jest.fn(async () => null);
      (svc.settlement as any).emailService.sendRawEmail = sendRawEmail;
      await svc.handleRazorpayWebhook(failed({ refundKey: 'auto:reg:reg-1' }), 'sig', 'evt_rf3');
      expect(prisma.eventRegistration.update).not.toHaveBeenCalled();
      expect(sendRawEmail).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Refund failed'), expect.any(String));
    });
  });

  describe('createPaymentOrder retry cleanup (S13)', () => {
    const run = async (stale: any) => {
      const { svc, prisma } = build({ eventRegs: [stale] });
      (svc.checkout as any).assertMayRegister = jest.fn();
      (svc.checkout as any).assertTicketNotBlocked = jest.fn();
      // No ticket types → throws right after the cleanup; we only assert the cleanup.
      await expect(
        svc.createPaymentOrder(EVENT, USER, { ticketTypeId: 'tt-1' } as any),
      ).rejects.toThrow(NotFoundException);
      return prisma;
    };
    const base = { id: 'stale', ticketTypeId: 'tt-1', paymentStatus: PaymentStatus.PENDING, status: RegistrationStatus.REGISTERED };

    it('cancels (never deletes) a pending row that already has a Razorpay order', async () => {
      const prisma = await run({ ...base, orderId: 'order_live' });
      expect(prisma.eventRegistration.delete).not.toHaveBeenCalled();
      expect(prisma.eventRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'stale' },
          data: expect.objectContaining({ status: RegistrationStatus.CANCELLED }),
        }),
      );
    });

    it('still deletes a pending row that never reached checkout', async () => {
      const prisma = await run({ ...base, orderId: null });
      expect(prisma.eventRegistration.delete).toHaveBeenCalledWith({ where: { id: 'stale' } });
    });
  });
});

/**
 * C9: a settled paid registration confirms once, from whichever path won the
 * PAID claim, with the receipt going to the user's best email in IST.
 */
describe('paid registration confirmations (C9)', () => {
  const build = (claimCount: number) => {
    const row = {
      id: 'reg-1', eventId: 'ev-1', userId: 'u-1', status: RegistrationStatus.REGISTERED, quantity: 1,
      groupSize: null, ticketTypeId: null, waitlistStatus: null, qrCode: 'QR', totalAmount: 105, processingFee: 5,
      user: { fullName: 'Asha', username: null },
      event: { id: 'ev-1', title: 'Fest', type: 'IN_PERSON', startDateTime: new Date('2026-12-01T04:30:00Z'), endDateTime: new Date('2026-12-01T07:30:00Z') },
      tickets: [{ ticketCode: 'T-1' }],
    };
    const prisma: any = {
      eventRegistration: {
        findUnique: jest.fn(async () => row),
        updateMany: jest.fn(async () => ({ count: claimCount })),
      },
      eventTicket: { create: jest.fn(async () => ({})) },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const email = { sendPaymentConfirmation: jest.fn(async () => undefined) };
    const confirmations = { sendRegistrationConfirmations: jest.fn(async () => undefined) };
    const groupSeats = { createSeatsForRegistration: jest.fn(async () => undefined), primaryEmail: jest.fn(async () => 'asha@x.in') };
    const cache = { redis: { getClient: () => null }, invalidateCheckinCache: jest.fn(async () => undefined) };
    const coupons = { confirmByRegistration: jest.fn(async () => undefined) };
    const svc = new RegistrationPaymentsService(
      prisma, email as any, {} as any, cache as any, {} as any, {} as any, groupSeats as any,
      coupons as any, {} as any, {} as any, confirmations as any, {} as any,
    );
    jest.spyOn(svc as any, 'takeSeatsOrQueueRefund').mockResolvedValue(true);
    jest.spyOn(svc as any, 'refundIfDuplicate').mockResolvedValue(undefined);
    return { svc, email, confirmations, groupSeats };
  };

  it('the webhook winner sends the confirmation and an IST receipt to the best email', async () => {
    const { svc, email, confirmations, groupSeats } = build(1);
    await (svc as any).completeWebhookPayment('reg-1', 'pay_1', 'order_1');
    expect(confirmations.sendRegistrationConfirmations).toHaveBeenCalledTimes(1);
    expect(groupSeats.primaryEmail).toHaveBeenCalledWith('u-1', null);
    expect(email.sendPaymentConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'asha@x.in', razorpayPaymentId: 'pay_1', eventTime: '10:00 AM - 1:00 PM IST', ticketCode: 'T-1' }),
    );
  });

  it('the path that lost the claim sends nothing', async () => {
    const { svc, email, confirmations } = build(0);
    await (svc as any).completeWebhookPayment('reg-1', 'pay_1', 'order_1');
    expect(confirmations.sendRegistrationConfirmations).not.toHaveBeenCalled();
    expect(email.sendPaymentConfirmation).not.toHaveBeenCalled();
  });
});
