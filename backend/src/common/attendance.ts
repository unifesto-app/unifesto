import { GroupSeatStatus, PaymentStatus, Prisma, PrismaClient, RegistrationStatus } from '@prisma/client';

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
 * A group member who joined (claimed a seat) on an attending booking. GroupSeat
 * is the only roster source; the lead's own seat is excluded by callers that
 * already reach the lead through the registration row.
 */
export const CLAIMED_MEMBER_SEAT = {
  status: GroupSeatStatus.CLAIMED,
  claimedByUserId: { not: null },
  registration: COUNTS_AS_ATTENDING,
} satisfies Prisma.GroupSeatWhereInput;

/**
 * Every account attending an event: booking holders plus group members who
 * claimed a seat. Use this for anything sent "to the attendees".
 */
export async function attendingUserIds(
  prisma: Pick<PrismaClient, 'eventRegistration' | 'groupSeat'>,
  eventId: string,
): Promise<string[]> {
  const [regs, seats] = await Promise.all([
    prisma.eventRegistration.findMany({
      where: { eventId, ...COUNTS_AS_ATTENDING },
      select: { userId: true },
    }),
    prisma.groupSeat.findMany({
      where: { ...CLAIMED_MEMBER_SEAT, registration: { eventId, ...COUNTS_AS_ATTENDING } },
      select: { claimedByUserId: true },
    }),
  ]);
  return [
    ...new Set([
      ...regs.map((r) => r.userId),
      ...seats.map((s) => s.claimedByUserId).filter((id): id is string => !!id),
    ]),
  ];
}

/** Whether this account attends the event: its own confirmed booking, or a claimed seat on one. */
export async function isAttending(
  prisma: Pick<PrismaClient, 'eventRegistration' | 'groupSeat'>,
  eventId: string,
  userId: string,
): Promise<boolean> {
  const [regs, seats] = await Promise.all([
    prisma.eventRegistration.count({ where: { eventId, userId, ...COUNTS_AS_ATTENDING } }),
    prisma.groupSeat.count({
      where: { ...CLAIMED_MEMBER_SEAT, claimedByUserId: userId, registration: { eventId, ...COUNTS_AS_ATTENDING } },
    }),
  ]);
  return regs + seats > 0;
}

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
