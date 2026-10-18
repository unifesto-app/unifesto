import { BadRequestException } from '@nestjs/common';
import { RegistrationStatus, WaitlistStatus } from '@prisma/client';
import { RegistrationCheckoutService } from './registration-checkout.service';

/**
 * A19: a new checkout clears the user's abandoned same-type attempt, but never
 * deletes a row money can still reach (Razorpay order or curator payment link)
 * and never touches a waiting list row.
 */
function build() {
  const tx: any = {
    eventRegistration: { update: jest.fn(async () => ({})), delete: jest.fn(async () => ({})) },
  };
  const prisma: any = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
  const payments: any = { cancelPaymentLink: jest.fn(async () => undefined) };
  const coupons: any = { releaseByRegistration: jest.fn(async () => undefined) };
  const svc = new RegistrationCheckoutService(
    prisma, {} as any, {} as any, {} as any, payments, {} as any, {} as any, coupons, {} as any,
  );
  const clear = (stale: any) =>
    (svc as any).clearAbandonedAttempt(
      { orderId: null, paymentLinkId: null, status: RegistrationStatus.REGISTERED, waitlistStatus: null, id: 'r1', ...stale },
      'Superseded',
    );
  return { tx, payments, coupons, clear };
}

describe('checkout cleanup (A19)', () => {
  it('deletes a row that never reached Razorpay, releasing its coupon', async () => {
    const { tx, coupons, clear } = build();
    await clear({});
    expect(coupons.releaseByRegistration).toHaveBeenCalledWith(tx, 'r1');
    expect(tx.eventRegistration.delete).toHaveBeenCalled();
    expect(tx.eventRegistration.update).not.toHaveBeenCalled();
  });

  it('cancels (not deletes) a payment-link row and cancels the link', async () => {
    const { tx, payments, clear } = build();
    await clear({ paymentLinkId: 'plink_1' });
    expect(tx.eventRegistration.delete).not.toHaveBeenCalled();
    expect(tx.eventRegistration.update.mock.calls[0][0].data.status).toBe(RegistrationStatus.CANCELLED);
    expect(payments.cancelPaymentLink).toHaveBeenCalledWith('plink_1');
  });

  it('cancels (not deletes) a row with a Razorpay order', async () => {
    const { tx, payments, clear } = build();
    await clear({ orderId: 'order_1' });
    expect(tx.eventRegistration.delete).not.toHaveBeenCalled();
    expect(tx.eventRegistration.update).toHaveBeenCalled();
    expect(payments.cancelPaymentLink).not.toHaveBeenCalled();
  });

  it.each([WaitlistStatus.WAITING, WaitlistStatus.OFFERED])(
    'refuses to clear a %s waiting list row',
    async (waitlistStatus) => {
      const { tx, clear } = build();
      await expect(clear({ waitlistStatus })).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.eventRegistration.delete).not.toHaveBeenCalled();
      expect(tx.eventRegistration.update).not.toHaveBeenCalled();
    },
  );

  it('leaves an already cancelled row alone', async () => {
    const { tx, clear } = build();
    await clear({ status: RegistrationStatus.CANCELLED, orderId: 'order_1' });
    expect(tx.eventRegistration.delete).not.toHaveBeenCalled();
    expect(tx.eventRegistration.update).not.toHaveBeenCalled();
  });
});
