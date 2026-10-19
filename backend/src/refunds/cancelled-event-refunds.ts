import type { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentStatus, Prisma, PrismaClient, RefundRequesterRole, RefundStatus, SupportDesk } from '@prisma/client';
import { openRefundCase, updateRefundCase } from './refund-cases';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * A cancelled event owes every paid attendee their ticket price back (A24,
 * base only: the processing fee is kept, as the refund policy says). Opens one
 * refund request per paid booking, straight to Unifesto (PENDING_ADMIN), and
 * moves any request still waiting on the curator there too. A booking that
 * already has an open request keeps it (partial unique index → skipped). An
 * unsized request refunds everything still refundable, extra seats included.
 * Each new request opens a CANCELLATION case on the Platform desk (D6), and a
 * moved one takes its case there. Returns how many new requests it opened.
 * Safe to run again.
 */
export async function openCancelledEventRefunds(
  db: Db,
  eventId: string,
  actorId: string,
  reason?: string | null,
  events?: EventEmitter2,
): Promise<number> {
  const paid = await db.eventRegistration.findMany({
    where: {
      eventId,
      paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] },
      refundDueAt: null, // already being refunded in full automatically
      razorpayAmount: { gt: 0 },
    },
    select: { id: true, userId: true },
  });
  const waiting = await db.refundRequest.findMany({
    where: { eventId, status: RefundStatus.PENDING_CURATOR },
    select: { id: true, supportTicketId: true },
  });
  await db.refundRequest.updateMany({
    where: { id: { in: waiting.map((r) => r.id) }, status: RefundStatus.PENDING_CURATOR },
    data: { status: RefundStatus.PENDING_ADMIN, curatorNote: 'Event cancelled' },
  });
  for (const r of waiting) {
    updateRefundCase(events, r, actorId, 'The event was cancelled, so Unifesto handles this refund now.', {
      desk: SupportDesk.PLATFORM,
    });
  }
  if (!paid.length) return 0;
  const why = `Event cancelled${reason?.trim() ? `: ${reason.trim()}` : ''}`.slice(0, 2000);
  const created = await db.refundRequest.createManyAndReturn({
    data: paid.map((r) => ({
      registrationId: r.id,
      eventId,
      requestedById: actorId,
      requesterRole: RefundRequesterRole.CURATOR,
      status: RefundStatus.PENDING_ADMIN,
      reason: why,
    })),
    skipDuplicates: true,
    select: { id: true, registrationId: true, status: true, supportTicketId: true },
  });
  if (created.length && events) {
    const event = await db.event.findUnique({ where: { id: eventId }, select: { spaceId: true, title: true } });
    const holder = new Map(paid.map((r) => [r.id, r.userId]));
    for (const r of created) {
      openRefundCase(events, {
        ...r,
        eventId,
        reason: why,
        holderId: holder.get(r.registrationId)!,
        raisedByHolder: false,
        cancellation: true,
        event: event!,
      });
    }
  }
  return created.length;
}
