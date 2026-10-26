import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** The ticket ran out of seats between the availability check and the take. */
export class SoldOutError extends BadRequestException {
  constructor(message = 'Not enough tickets available') {
    super(message);
  }
}

/**
 * Take n seats on a ticket type, atomically against its capacity: the check and
 * the increment are one UPDATE, so two buyers racing for the last seat can't
 * both win. Throws SoldOutError instead of overselling. Unlimited (null
 * total_quantity) always passes. No ticket type = nothing to take.
 */
export async function takeTicketSeats(
  tx: Prisma.TransactionClient,
  ticketTypeId: string | null | undefined,
  n: number,
  message?: string,
): Promise<void> {
  if (!ticketTypeId || n <= 0) return;
  const took = await tx.$executeRaw`
    UPDATE event_ticket_types SET sold_count = sold_count + ${n}
    WHERE id = ${ticketTypeId}::uuid AND (total_quantity IS NULL OR sold_count + ${n} <= total_quantity)`;
  if (took !== 1) throw new SoldOutError(message);
}

/** The event is at its plan's attendee limit (T9). */
export const PLAN_FULL =
  "This event has reached its plan's attendee limit. The organiser can upgrade to add more.";

/**
 * Take n seats on the ticket type (atomic, see above) and count n attendees on
 * the event, atomically against the space plan's attendees per event (T9):
 * every add path (checkout, payment claim, restore, import, manual add, group
 * seats) comes through here. ponytail: reads the subscription row's plan, so a
 * lapsed plan keeps its cap until the expiry cron moves it to General; no row =
 * no cap.
 */
export async function takeSeats(
  tx: Prisma.TransactionClient,
  reg: { eventId: string; ticketTypeId?: string | null },
  n: number,
  message?: string,
): Promise<void> {
  await takeTicketSeats(tx, reg.ticketTypeId, n, message);
  const took = await tx.$executeRaw`
    UPDATE events e SET registered_count = e.registered_count + ${n}, updated_at = now()
    WHERE e.id = ${reg.eventId}::uuid
      AND (SELECT p.attendees_per_event IS NULL OR e.registered_count + ${n} <= p.attendees_per_event
             FROM org_subscriptions s JOIN plan_configs p ON p.plan = s.plan
            WHERE s.space_id = e.space_id) IS NOT FALSE`;
  if (took !== 1) throw new SoldOutError(PLAN_FULL);
}

/**
 * Take one seat on a session, atomically against its capacity and only while
 * it is still open (PUBLISHED): two payers racing for the last seat, or a
 * payment landing after the host cancelled, can't both win. Throws SoldOutError.
 */
export async function takeSessionSeat(
  tx: Prisma.TransactionClient,
  sessionId: string,
  message = 'Session is full',
): Promise<void> {
  const took = await tx.$executeRaw`
    UPDATE sessions SET registered_count = registered_count + 1
    WHERE id = ${sessionId}::uuid AND status = 'PUBLISHED'
      AND (capacity IS NULL OR registered_count < capacity)`;
  if (took !== 1) throw new SoldOutError(message);
}
