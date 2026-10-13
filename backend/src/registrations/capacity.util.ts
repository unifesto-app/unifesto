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

/** Take n seats on the ticket type (atomic, see above) and count n attendees on the event. */
export async function takeSeats(
  tx: Prisma.TransactionClient,
  reg: { eventId: string; ticketTypeId?: string | null },
  n: number,
  message?: string,
): Promise<void> {
  await takeTicketSeats(tx, reg.ticketTypeId, n, message);
  await tx.event.update({ where: { id: reg.eventId }, data: { registeredCount: { increment: n } } });
}
