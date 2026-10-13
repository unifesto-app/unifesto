import { PaymentStatus, Prisma } from '@prisma/client';

/**
 * Rows that record money actually moving: a Razorpay payment that was taken
 * (whether or not it was later refunded), a refund request, a payout. Deleting
 * an event, session or space cascades onto these, so a delete is refused while
 * any exist (S14). Free registrations carry no paymentId and don't count.
 */
const PAID = {
  paymentId: { not: null },
  paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED] },
};

type Db = Pick<
  Prisma.TransactionClient,
  'eventRegistration' | 'refundRequest' | 'stayBooking' | 'payout' | 'sessionRegistration'
>;

/** Count of money rows under the events matching `event` (extra-seat payments hang off registrations). */
export async function eventMoneyRecords(db: Db, event: Prisma.EventWhereInput): Promise<number> {
  const counts = await Promise.all([
    db.eventRegistration.count({ where: { event, ...PAID } }),
    db.refundRequest.count({ where: { event } }),
    db.stayBooking.count({ where: { event, ...PAID } }),
    db.payout.count({ where: { event } }),
  ]);
  return counts.reduce((a, b) => a + b, 0);
}

/** Count of paid registrations under the sessions matching `session`. */
export function sessionMoneyRecords(db: Db, session: Prisma.SessionWhereInput): Promise<number> {
  return db.sessionRegistration.count({ where: { session, ...PAID } });
}
