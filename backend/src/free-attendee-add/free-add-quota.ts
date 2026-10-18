import { ForbiddenException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/** Shown when a comp of a paid ticket has no approval (or no seats) left. */
export const NO_FREE_ADD_SEATS =
  'Adding paid seats for free needs platform approval, and this event has no free seats left for that ticket. ' +
  'Collect payment instead, or request more free seats.';

/**
 * Draw `seats` from an APPROVED free-add quota for this event and ticket type
 * (A27). Atomic: the capacity check re-runs on the locked row, so two comps
 * racing for the last seats can't both win. A type-scoped approval is used
 * before an any-type one. Throws when no approval has room.
 * ponytail: one comp draws from one approval; split across approvals if admins
 * start issuing many small ones for the same ticket.
 */
export async function takeFreeAddSeats(
  db: Db,
  eventId: string,
  ticketTypeId: string,
  seats: number,
): Promise<void> {
  const n = Math.max(1, Math.trunc(seats));
  const taken = await db.$executeRaw`
    UPDATE "free_attendee_add_requests"
       SET "used_seats" = "used_seats" + ${n}, "updated_at" = now()
     WHERE "id" = (
             SELECT "id" FROM "free_attendee_add_requests"
              WHERE "event_id" = ${eventId}::uuid
                AND "status" = 'APPROVED'
                AND ("ticket_type_id" = ${ticketTypeId}::uuid OR "ticket_type_id" IS NULL)
                AND ("approved_seats" IS NULL OR "used_seats" + ${n} <= "approved_seats")
              ORDER BY "ticket_type_id" NULLS LAST, "created_at"
              LIMIT 1
           )
       AND "status" = 'APPROVED'
       AND ("approved_seats" IS NULL OR "used_seats" + ${n} <= "approved_seats")`;
  if (taken !== 1) throw new ForbiddenException(NO_FREE_ADD_SEATS);
}

/**
 * Free paid seats still comp-able for this ticket type: null = unlimited (a
 * legacy approval), 0 = none. Read-only, for previews and screens.
 */
export async function freeAddSeatsLeft(
  db: Db,
  eventId: string,
  ticketTypeId: string,
): Promise<number | null> {
  const approvals = await db.freeAttendeeAddRequest.findMany({
    where: { eventId, status: 'APPROVED', OR: [{ ticketTypeId }, { ticketTypeId: null }] },
    select: { approvedSeats: true, usedSeats: true },
  });
  if (approvals.some((a) => a.approvedSeats == null)) return null;
  return approvals.reduce((sum, a) => sum + Math.max(0, (a.approvedSeats ?? 0) - a.usedSeats), 0);
}
