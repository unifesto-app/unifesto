import { BadRequestException } from '@nestjs/common';
import { PaymentStatus, RegistrationStatus } from '@prisma/client';
import * as crypto from 'crypto';

// Shared by the registration services (split out of registrations.service.ts).

/**
 * Platform ceiling on one group booking, whatever the ticket allows. Each
 * person is a group_seats row, so an unbounded size is a memory/DB bomb (J8).
 */
export const MAX_GROUP_SIZE = 100;

/**
 * The people a booking covers: null for non-GROUP tickets (whatever the client
 * sent), else the requested size checked against the ticket's bounds and
 * MAX_GROUP_SIZE. Every registration path runs this before using a size.
 */
export function resolveGroupSize(
  ticketType: { kind?: string | null; minGroupSize?: number | null; maxGroupSize?: number | null },
  requested: number | null | undefined,
): number | null {
  if (ticketType.kind !== 'GROUP') return null;
  const size = requested ?? ticketType.minGroupSize ?? 1;
  const min = ticketType.minGroupSize ?? 1;
  const max = Math.min(ticketType.maxGroupSize ?? MAX_GROUP_SIZE, MAX_GROUP_SIZE);
  if (!Number.isInteger(size) || size < min || size > max) {
    throw new BadRequestException(`Group size must be between ${min} and ${max}`);
  }
  return size;
}

/**
 * A payment may settle a registration only while its money is unsettled and
 * the row is live: never revive a refunded or cancelled row (a replayed
 * receipt or a late capture of a superseded checkout).
 */
export const SETTLEABLE_PAYMENT: PaymentStatus[] = [
  PaymentStatus.PENDING,
  PaymentStatus.FAILED,
];
export const SETTLEABLE = {
  paymentStatus: { in: SETTLEABLE_PAYMENT },
  status: { not: RegistrationStatus.CANCELLED },
};
/** Payment states whose registration occupies its seats (free rows are PAID at ₹0). */
export const HOLDS_SEAT_PAYMENT: PaymentStatus[] = [
  PaymentStatus.PAID,
  PaymentStatus.PARTIALLY_REFUNDED,
];
/**
 * A live, paid, non-waitlisted row: the only kind whose seats are taken, so the
 * only kind a team change may move or a group may send tickets from (A28).
 */
export const holdsSeats = (r: {
  status: RegistrationStatus;
  paymentStatus: PaymentStatus;
  isWaitlisted: boolean;
}) =>
  r.status !== RegistrationStatus.CANCELLED &&
  HOLDS_SEAT_PAYMENT.includes(r.paymentStatus) &&
  !r.isWaitlisted;
/**
 * A claimed member's own ticket on a group registration: the one stamped with
 * one of their emails, else (claims from before tickets were stamped) the
 * unstamped ticket minted within a minute of their claim. Never a teammate's
 * or the group's own ticket (A28).
 */
export function seatTicketOf<T extends { attendeeEmail: string | null; createdAt: Date }>(
  tickets: T[],
  emails: Set<string>,
  claimedAt: Date | null,
): T | undefined {
  const stamped = tickets.find((t) => t.attendeeEmail && emails.has(t.attendeeEmail.trim().toLowerCase()));
  if (stamped || !claimedAt) return stamped;
  const gap = (t: T) => Math.abs(+t.createdAt - +claimedAt);
  return tickets.filter((t) => !t.attendeeEmail && gap(t) < 60_000).sort((a, b) => gap(a) - gap(b))[0];
}
/** A seat's holder as `memberSeatTicket` needs them: typed-in details and/or the claiming account. */
export interface SeatHolder {
  seatIndex: number;
  claimedAt: Date | null;
  memberDetails: unknown;
  claimedBy?: { identities: { email: string | null }[] } | null;
}
/**
 * The pass of a member seat (2..N): its own seat ticket, by the holder's
 * emails. Seat 1 is the lead, whose pass is the group's QR. The by-claim-time
 * fallback is for account claims only: typed-in seats are claimed at checkout,
 * the same minute the group's own ticket is minted.
 */
export function memberSeatTicket<T extends { attendeeEmail: string | null; createdAt: Date }>(
  seat: SeatHolder,
  tickets: T[],
): T | undefined {
  if (seat.seatIndex <= 1) return undefined;
  const md = (seat.memberDetails ?? {}) as { email?: unknown; customFields?: { email?: unknown } };
  const emails = [md.email, md.customFields?.email, ...(seat.claimedBy?.identities ?? []).map((i) => i.email)]
    .filter((e): e is string => typeof e === 'string' && !!e.trim())
    .map((e) => e.trim().toLowerCase());
  return seatTicketOf(tickets, new Set(emails), seat.claimedBy ? seat.claimedAt : null);
}
/**
 * How many tickets a purchase is, for the per-ticket buyer-fee cap (A34): each
 * seat of a per-person group, a flat-priced group as one, else the quantity.
 */
export const ticketsIn = (
  ticketType: { kind?: string | null; groupPricingMode?: string | null },
  sizes: { quantity?: number | null; groupSize?: number | null },
): number =>
  ticketType.kind === 'GROUP'
    ? ticketType.groupPricingMode === 'PER_PERSON'
      ? sizes.groupSize ?? 1
      : 1
    : sizes.quantity ?? 1;

/** Reason stamped on a paid row cancelled because its ticket sold out mid-payment. */
export const SOLD_OUT_REASON =
  'Sold out while the payment was in progress; refunded in full';
export const isSettleable = (r: {
  paymentStatus: PaymentStatus;
  status: RegistrationStatus;
}) =>
  SETTLEABLE_PAYMENT.includes(r.paymentStatus) &&
  r.status !== RegistrationStatus.CANCELLED;

export function generateQRCode(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function generateTicketCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

/**
 * Seats a registration occupies: the group size for GROUP tickets, else the
 * quantity. Capacity and the soldCount/registeredCount counters use this so a
 * group of N takes up N seats — even though the group still shares one ticket.
 */
export function seatsFor(r: {
  groupSize?: number | null;
  quantity: number;
}): number {
  return r.groupSize ?? r.quantity;
}

/**
 * Format event date for display
 * Output: "1 July 2026"
 */
export function formatEventDate(
  dateTime: Date,
  timezone = 'Asia/Kolkata',
): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  }).format(dateTime);
}

/**
 * Format event time range
 * Output: "10:00 AM - 01:00 PM IST"
 */
export function formatEventTime(
  startTime: Date,
  endTime: Date,
  timezone = 'Asia/Kolkata',
): string {
  const formatTime = (date: Date) =>
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone,
    }).format(date);

  return `${formatTime(startTime)} - ${formatTime(endTime)} IST`;
}
