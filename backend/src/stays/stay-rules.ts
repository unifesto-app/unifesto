import {
  StayBookingStatus,
  StayGender,
  StayPaymentMode,
  StayPricing,
} from '@prisma/client';
import * as crypto from 'crypto';

/**
 * Pure rules for Unifesto Stay: calendar nights, bed occupancy and pricing.
 * Kept free of Prisma calls so they are unit-tested directly.
 *
 * Dates are calendar days. They travel as "YYYY-MM-DD" and are stored in
 * Postgres DATE columns, which Prisma hands back as a Date at UTC midnight.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Statuses whose beds are taken. PENDING holds nothing until approved. */
export const HOLDS_BEDS: StayBookingStatus[] = [
  StayBookingStatus.AWAITING_PAYMENT,
  StayBookingStatus.CONFIRMED,
  StayBookingStatus.CHECKED_IN,
  StayBookingStatus.CHECKED_OUT,
];

/** A booking the guest still "has": one per person per event. */
export const OPEN_STATUSES: StayBookingStatus[] = [
  StayBookingStatus.PENDING,
  StayBookingStatus.AWAITING_PAYMENT,
  StayBookingStatus.CONFIRMED,
  StayBookingStatus.CHECKED_IN,
];

export const GUEST_GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export type GuestGender = (typeof GUEST_GENDERS)[number];

/** "2026-10-12" → Date at UTC midnight, or null when not a real date. */
export function parseDay(s: unknown): Date | null {
  if (typeof s !== 'string' || !ISO_DAY.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s
    ? null
    : d;
}

/** Date (UTC midnight) → "YYYY-MM-DD". */
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Nights between check-in and check-out (check-out day is not a night). */
export const nightsBetween = (from: Date, to: Date) =>
  Math.round((to.getTime() - from.getTime()) / DAY_MS);

/** Each night of a stay, as day keys: 10th→12th gives ["…10", "…11"]. */
export function nightKeys(from: Date, to: Date): string[] {
  const out: string[] = [];
  for (let t = from.getTime(); t < to.getTime(); t += DAY_MS)
    out.push(dayKey(new Date(t)));
  return out;
}

export interface Holding {
  checkInDate: Date;
  checkOutDate: Date;
  guestCount: number;
}

/**
 * Beds left on each night of [from, to) for an option with `totalBeds`, given
 * the bookings currently holding beds. Never below zero.
 */
export function bedsLeftByNight(
  totalBeds: number,
  holdings: Holding[],
  from: Date,
  to: Date,
): { date: string; left: number }[] {
  return nightKeys(from, to).map((date) => {
    const t = new Date(`${date}T00:00:00.000Z`).getTime();
    const used = holdings
      .filter(
        (h) => h.checkInDate.getTime() <= t && t < h.checkOutDate.getTime(),
      )
      .reduce((sum, h) => sum + h.guestCount, 0);
    return { date, left: Math.max(0, totalBeds - used) };
  });
}

/** The first night in the range that can't take `guests` more, or null. */
export function firstFullNight(
  totalBeds: number,
  holdings: Holding[],
  from: Date,
  to: Date,
  guests: number,
): string | null {
  return (
    bedsLeftByNight(totalBeds, holdings, from, to).find((n) => n.left < guests)
      ?.date ?? null
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What a booking costs. The processing fee applies to ONLINE payments only —
 * money collected at the property never passes through Razorpay.
 */
export function priceBooking(input: {
  price: number;
  pricing: StayPricing;
  paymentMode: StayPaymentMode;
  guests: number;
  nights: number;
  feeFor: (base: number) => number;
}): {
  paymentMode: StayPaymentMode;
  baseAmount: number;
  processingFee: number;
  totalAmount: number;
} {
  const units =
    input.pricing === StayPricing.PER_NIGHT
      ? input.guests * input.nights
      : input.guests;
  const baseAmount = round2(input.price * units);
  if (baseAmount <= 0) {
    return {
      paymentMode: StayPaymentMode.FREE,
      baseAmount: 0,
      processingFee: 0,
      totalAmount: 0,
    };
  }
  // A priced option still marked FREE is treated as pay-at-property.
  const paymentMode =
    input.paymentMode === StayPaymentMode.FREE
      ? StayPaymentMode.PAY_AT_PROPERTY
      : input.paymentMode;
  const processingFee =
    paymentMode === StayPaymentMode.ONLINE
      ? round2(input.feeFor(baseAmount))
      : 0;
  return {
    paymentMode,
    baseAmount,
    processingFee,
    totalAmount: round2(baseAmount + processingFee),
  };
}

/** Does every guest fit the option's gender rule? */
export function gendersFit(rule: StayGender, genders: string[]): boolean {
  if (rule === StayGender.ANY) return true;
  return genders.every((g) => g === rule);
}

// No 0/O/1/I so a pass read out over the phone can't be misheard.
const PASS_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** "STAY-7KQ2MX": what the Stay Pass QR encodes. */
export function newPassCode(): string {
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (const b of bytes) code += PASS_ALPHABET[b % PASS_ALPHABET.length];
  return `STAY-${code}`;
}

export const PASS_CODE_RE = /^STAY-[2-9A-HJ-NP-Z]{6}$/;
