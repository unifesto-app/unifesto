import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentStatus, RegistrationStatus } from '@prisma/client';
import { RegistrationsService } from './registrations.service';

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
    const svc = new RegistrationsService(
      prisma, {} as any, {} as any, { redis: { getClient: () => null } } as any, {} as any, {} as any,
      payments as any, waitlist as any, {} as any, {} as any, {} as any,
      coupons as any, { completeFromWebhook: jest.fn(async () => false) } as any,
      { completeFromWebhook: jest.fn(async () => false) } as any,
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
      expect((svc as any).waitlist.convert).not.toHaveBeenCalled();
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
      const complete = jest.spyOn(svc as any, 'completeWebhookPayment');
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

  describe('createPaymentOrder retry cleanup (S13)', () => {
    const run = async (stale: any) => {
      const { svc, prisma } = build({ eventRegs: [stale] });
      (svc as any).assertMayRegister = jest.fn();
      (svc as any).assertTicketNotBlocked = jest.fn();
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
