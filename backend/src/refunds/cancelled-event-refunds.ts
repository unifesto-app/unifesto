import { PaymentStatus, Prisma, PrismaClient, RefundRequesterRole, RefundStatus } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * A cancelled event owes every paid attendee their ticket price back (A24,
 * base only: the processing fee is kept, as the refund policy says). Opens one
 * refund request per paid booking, straight to Unifesto (PENDING_ADMIN), and
 * moves any request still waiting on the curator there too. A booking that
 * already has an open request keeps it (partial unique index → skipped). An
 * unsized request refunds everything still refundable, extra seats included.
 * Returns how many new requests it opened. Safe to run again.
 */
export async function openCancelledEventRefunds(
  db: Db,
  eventId: string,
  actorId: string,
  reason?: string | null,
): Promise<number> {
  const paid = await db.eventRegistration.findMany({
    where: {
      eventId,
      paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] },
      refundDueAt: null, // already being refunded in full automatically
      razorpayAmount: { gt: 0 },
    },
    select: { id: true },
  });
  await db.refundRequest.updateMany({
    where: { eventId, status: RefundStatus.PENDING_CURATOR },
    data: { status: RefundStatus.PENDING_ADMIN, curatorNote: 'Event cancelled' },
  });
  if (!paid.length) return 0;
  const created = await db.refundRequest.createMany({
    data: paid.map((r) => ({
      registrationId: r.id,
      eventId,
      requestedById: actorId,
      requesterRole: RefundRequesterRole.CURATOR,
      status: RefundStatus.PENDING_ADMIN,
      reason: `Event cancelled${reason?.trim() ? `: ${reason.trim()}` : ''}`.slice(0, 2000),
    })),
    skipDuplicates: true,
  });
  return created.count;
}
