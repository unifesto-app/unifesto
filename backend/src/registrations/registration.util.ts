import { PaymentStatus, RegistrationStatus } from '@prisma/client';
import * as crypto from 'crypto';

// Shared by the registration services (split out of registrations.service.ts).

/**
 * A payment may settle a registration only while its money is unsettled and
 * the row is live: never revive a refunded or cancelled row (a replayed
 * receipt or a late capture of a superseded checkout).
 */
export const SETTLEABLE_PAYMENT: PaymentStatus[] = [PaymentStatus.PENDING, PaymentStatus.FAILED];
export const SETTLEABLE = {
  paymentStatus: { in: SETTLEABLE_PAYMENT },
  status: { not: RegistrationStatus.CANCELLED },
};
/** Payment states whose registration occupies its seats (free rows are PAID at ₹0). */
export const HOLDS_SEAT_PAYMENT: PaymentStatus[] = [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED];
/** Reason stamped on a paid row cancelled because its ticket sold out mid-payment. */
export const SOLD_OUT_REASON = 'Sold out while the payment was in progress; refunded in full';
export const isSettleable = (r: { paymentStatus: PaymentStatus; status: RegistrationStatus }) =>
  SETTLEABLE_PAYMENT.includes(r.paymentStatus) && r.status !== RegistrationStatus.CANCELLED;

export function generateQRCode(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function generateTicketCode(): string {
  return crypto
    .randomBytes(4)
    .toString('hex')
    .toUpperCase();
}

/**
 * Seats a registration occupies: the group size for GROUP tickets, else the
 * quantity. Capacity and the soldCount/registeredCount counters use this so a
 * group of N takes up N seats — even though the group still shares one ticket.
 */
export function seatsFor(r: { groupSize?: number | null; quantity: number }): number {
  return r.groupSize ?? r.quantity;
}

/**
 * Format event date for display
 * Output: "1 July 2026"
 */
export function formatEventDate(dateTime: Date, timezone = 'Asia/Kolkata'): string {
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
export function formatEventTime(startTime: Date, endTime: Date, timezone = 'Asia/Kolkata'): string {
  const formatTime = (date: Date) =>
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone,
    }).format(date);

  return `${formatTime(startTime)} - ${formatTime(endTime)} IST`;
}
