import { BadRequestException } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Rows that record money actually moving: a Razorpay payment that was taken
 * (whether or not it was later refunded), a refund request, a payout. Their
 * foreign keys RESTRICT (A29), so deleting an event, space or user
 * never cascades over them; `deleteWithoutMoney` is the one way to delete
 * above them. Free registrations carry no paymentId and don't count.
 */
const PAID = {
  paymentId: { not: null },
  paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED] },
};
/** Free, abandoned or failed checkouts: safe to remove with what they sit under. */
const UNPAID = { NOT: PAID };

type Db = Pick<
  Prisma.TransactionClient,
  'eventRegistration' | 'refundRequest' | 'stayBooking' | 'payout' | 'groupSeatPurchase'
>;

/** Count of money rows under the events matching `event`, extra-seat payments included. */
export async function eventMoneyRecords(db: Db, event: Prisma.EventWhereInput): Promise<number> {
  const counts = await Promise.all([
    db.eventRegistration.count({ where: { event, ...PAID } }),
    db.refundRequest.count({ where: { event } }),
    db.stayBooking.count({ where: { event, ...PAID } }),
    db.groupSeatPurchase.count({ where: { registration: { event }, ...PAID } }),
    db.payout.count({ where: { event } }),
  ]);
  return counts.reduce((a, b) => a + b, 0);
}

/**
 * The shared guard for deleting events or a space (S14, A29). Refuses
 * with `message` while money rows exist under `event`, clears the unpaid rows
 * whose RESTRICT keys would otherwise block it, then runs `del`. A payment that
 * lands in between trips the foreign key and gets the same message, not a 500.
 */
export async function deleteWithoutMoney<T>(
  prisma: PrismaService,
  event: Prisma.EventWhereInput,
  message: string,
  del: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        if ((await eventMoneyRecords(tx, event)) > 0) throw new BadRequestException(message);
        await tx.groupSeatPurchase.deleteMany({ where: { registration: { event }, ...UNPAID } });
        await tx.stayBooking.deleteMany({ where: { event, ...UNPAID } });
        await tx.eventRegistration.deleteMany({ where: { event, ...UNPAID } });
        return del(tx);
      },
      { timeout: 60_000 },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      throw new BadRequestException(message);
    }
    throw e;
  }
}
