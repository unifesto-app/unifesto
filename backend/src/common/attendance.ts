import { PaymentStatus, Prisma, RegistrationStatus } from '@prisma/client';

/**
 * When a registration counts as a person attending.
 *
 * Confirmed (paid, or paid then partially refunded), not cancelled, and not
 * sitting on the waiting list. This is the same predicate the seat counters and
 * `AdminService.reconcileSeatCounts` use — every headcount in the product has
 * to agree, and the way two numbers on one screen start disagreeing is by each
 * inventing its own definition of "attending".
 *
 * Note a waiting list row with an OFFERED spot holds a seat but is *not* an
 * attendee yet, which is exactly what `isWaitlisted: false` encodes.
 */
export const COUNTS_AS_ATTENDING = {
  status: { not: RegistrationStatus.CANCELLED },
  isWaitlisted: false,
  paymentStatus: {
    in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED],
  },
} satisfies Prisma.EventRegistrationWhereInput;

/**
 * Matches registrations booked as a group.
 *
 * `groupSize` is what makes a booking a group, not the ticket's `kind`: a GROUP
 * ticket booked for one person still carries a groupSize, and a row without one
 * is a single person however it was sold.
 */
export const IS_GROUP_BOOKING = {
  groupSize: { gt: 0 },
} satisfies Prisma.EventRegistrationWhereInput;

/** The complement of `IS_GROUP_BOOKING` — one person, booked on their own. */
export const IS_INDIVIDUAL_BOOKING = {
  OR: [{ groupSize: null }, { groupSize: { lte: 0 } }],
} satisfies Prisma.EventRegistrationWhereInput;

/** Headcount for one event, split by how people booked. */
export interface AttendeeBreakdown {
  /** Total people. `individual + groupAttendees`. */
  total: number;
  /** People who booked on their own. */
  individual: number;
  /** People inside group bookings. */
  groupAttendees: number;
  /** How many group bookings that is. */
  groups: number;
}

export const EMPTY_BREAKDOWN: AttendeeBreakdown = {
  total: 0,
  individual: 0,
  groupAttendees: 0,
  groups: 0,
};
