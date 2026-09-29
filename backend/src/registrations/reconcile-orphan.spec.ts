import { BadRequestException } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { RegistrationsService } from './registrations.service';

/**
 * Unit tests for the orphaned-payment guards in
 * `RegistrationsService.reconcilePendingPayment`. These are the money-sensitive
 * seams: re-homing a captured payment onto a different registration is only ever
 * allowed for a *true* orphan (its own registration deleted), never when it
 * would steal a live registration's payment or double-count. The full
 * settlement (`applyReconciledPayment` → tickets/seats/emails) is spied, not
 * exercised — these tests pin the decision, not the downstream effects.
 */
describe('RegistrationsService — reconcile orphan guards', () => {
  const REG_ID = 'target-reg';
  const DELETED_REG = 'deleted-reg';
  const PAYMENT_ID = 'pay_abc';

  /** The PENDING registration reconcile is being run against. */
  const targetRegistration = {
    id: REG_ID,
    orderId: 'order_target',
    paymentStatus: PaymentStatus.PENDING,
    totalAmount: 205.8,
    processingFee: 9.8,
    razorpayAmount: 205.8, // → 20580 paise
    event: { title: 'Pitch Arena', slug: 'pitcharena' },
    user: { fullName: 'G.Shobha reddy', username: 'shobha', identities: [{ email: 'a@a.com' }] },
  };

  /**
   * Build the service with only the two deps this path touches; every other
   * constructor arg is unused here.
   */
  const build = (opts: {
    ownerExists: boolean;
    alreadyAttached?: { id: string } | null;
    payment?: Partial<{
      id: string;
      orderId: string | null;
      status: string;
      amount: number;
      amountRefunded: number;
      notes: Record<string, string>;
    }>;
  }) => {
    const prisma = {
      eventRegistration: {
        findUnique: jest.fn(({ where }: any) =>
          where.id === REG_ID
            ? targetRegistration
            : where.id === DELETED_REG
              ? opts.ownerExists
                ? { id: DELETED_REG }
                : null
              : null,
        ),
        findFirst: jest.fn(() => opts.alreadyAttached ?? null),
      },
    };
    const payments = {
      fetchPayment: jest.fn(async () => ({
        id: PAYMENT_ID,
        orderId: 'order_paid',
        status: 'captured',
        amount: 20580,
        amountRefunded: 0,
        notes: { registrationId: DELETED_REG },
        ...opts.payment,
      })),
    };
    const svc = new RegistrationsService(
      prisma as any, // prisma
      {} as any, // email
      {} as any, // whatsapp
      {} as any, // cache
      {} as any, // planConfig
      {} as any, // platformConfig
      payments as any, // payments
      {} as any, // waitlist
      {} as any, // events
      {} as any, // groupSeats
      {} as any, // redis
      {} as any, // coupons
      {} as any, // stayBookings
    );
    return { svc, prisma, payments };
  };

  it('refuses when the notes registration still exists (would steal a live payment)', async () => {
    const { svc } = build({ ownerExists: true });
    await expect(
      svc.reconcilePendingPayment(REG_ID, { paymentId: PAYMENT_ID, reassignOrphan: true }),
    ).rejects.toThrow(/belongs to a different registration/i);
  });

  it('refuses a true orphan without the explicit reassignOrphan opt-in', async () => {
    const { svc } = build({ ownerExists: false });
    await expect(
      svc.reconcilePendingPayment(REG_ID, { paymentId: PAYMENT_ID }),
    ).rejects.toThrow(/no longer exists|reassignOrphan/i);
  });

  it('refuses when the payment is already attached to another registration (no double-count)', async () => {
    const { svc } = build({ ownerExists: false, alreadyAttached: { id: 'other-reg' } });
    await expect(
      svc.reconcilePendingPayment(REG_ID, { paymentId: PAYMENT_ID, reassignOrphan: true }),
    ).rejects.toThrow(/already attached/i);
  });

  it('refuses when the payment amount does not match the registration', async () => {
    const { svc } = build({
      ownerExists: false,
      payment: { amount: 9999 }, // ≠ 20580 paise
    });
    await expect(
      svc.reconcilePendingPayment(REG_ID, { paymentId: PAYMENT_ID, reassignOrphan: true }),
    ).rejects.toThrow(/does not match/i);
  });

  it('re-homes a clean orphan onto the target registration (reaches settlement)', async () => {
    const { svc, payments } = build({ ownerExists: false });
    const settle = jest
      .spyOn(svc as any, 'applyReconciledPayment')
      .mockResolvedValue({ newStatus: PaymentStatus.PAID, changed: true });

    const result = await svc.reconcilePendingPayment(REG_ID, {
      paymentId: PAYMENT_ID,
      reassignOrphan: true,
    });

    expect(payments.fetchPayment).toHaveBeenCalledWith(PAYMENT_ID);
    expect(settle).toHaveBeenCalledTimes(1);
    // Settlement is handed the real captured payment, keyed to its paying order.
    expect(settle).toHaveBeenCalledWith(
      targetRegistration,
      PaymentStatus.PENDING,
      expect.objectContaining({
        paymentId: PAYMENT_ID,
        orderId: 'order_paid',
        status: 'captured',
        amount: 20580,
      }),
    );
    expect(result).toEqual({ newStatus: PaymentStatus.PAID, changed: true });
  });

  it('does not throw the orphan error on the normal same-registration path', async () => {
    // Payment notes point at THIS registration → the ordinary reconcile path.
    const { svc } = build({
      ownerExists: false,
      payment: { notes: { registrationId: REG_ID } },
    });
    const settle = jest
      .spyOn(svc as any, 'applyReconciledPayment')
      .mockResolvedValue({ newStatus: PaymentStatus.PAID, changed: true });

    await svc.reconcilePendingPayment(REG_ID, { paymentId: PAYMENT_ID });
    expect(settle).toHaveBeenCalledTimes(1);
  });

  it('leaves an already-settled registration untouched', async () => {
    const { svc, payments } = build({ ownerExists: false });
    (svc as any).prisma.eventRegistration.findUnique = jest.fn(() => ({
      ...targetRegistration,
      paymentStatus: PaymentStatus.PAID,
    }));

    const result = await svc.reconcilePendingPayment(REG_ID, { paymentId: PAYMENT_ID });
    expect(result.changed).toBe(false);
    expect(payments.fetchPayment).not.toHaveBeenCalled();
  });

  it('re-homes an orphan onto a FAILED registration (the attendee is owed the ticket)', async () => {
    // The attendee's own attempt failed, but a captured orphan payment (its
    // registration since deleted) is still owed to them. Attaching must settle.
    const { svc, payments } = build({ ownerExists: false });
    const failedTarget = { ...targetRegistration, paymentStatus: PaymentStatus.FAILED };
    (svc as any).prisma.eventRegistration.findUnique = jest.fn(({ where }: any) =>
      where.id === REG_ID ? failedTarget : null,
    );
    const settle = jest
      .spyOn(svc as any, 'applyReconciledPayment')
      .mockResolvedValue({ newStatus: PaymentStatus.PAID, changed: true });

    const result = await svc.reconcilePendingPayment(REG_ID, {
      paymentId: PAYMENT_ID,
      reassignOrphan: true,
    });

    expect(payments.fetchPayment).toHaveBeenCalledWith(PAYMENT_ID);
    expect(settle).toHaveBeenCalledWith(
      failedTarget,
      PaymentStatus.FAILED,
      expect.objectContaining({ paymentId: PAYMENT_ID, status: 'captured', amount: 20580 }),
    );
    expect(result).toEqual({ newStatus: PaymentStatus.PAID, changed: true });
  });
});
