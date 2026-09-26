import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CacheService } from '../cache/cache.service';
import {
  EventStatus,
  GroupSeatStatus,
  PaymentStatus,
  Prisma,
  RegistrationStatus,
  TicketStatus,
} from '@prisma/client';
import { SPACE_ADMIN_ROLE_CODES } from '../auth/authorization';
import { NOT_DELETED } from '../common/soft-delete';
import { COUNTS_AS_ATTENDING } from '../common/attendance';

@Injectable()
export class CheckinService {
  private readonly logger = new Logger(CheckinService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly cache: CacheService,
  ) {}

  /**
   * True when the user is a Space Admin of the space — the role allowed to
   * *manage* an event (including delegating check-in access). Legacy
   * ORGANISER/CO_ORGANISER are kept alongside SPACE_ADMIN so any un-backfilled
   * row still resolves; post-P2.2 the canonical code is SPACE_ADMIN.
   */
  async isSpaceOrganiser(userId: string, spaceId: string): Promise<boolean> {
    const count = await this.prisma.userRole.count({
      where: {
        userId,
        spaceId,
        role: { code: { in: [...SPACE_ADMIN_ROLE_CODES] } },
      },
    });
    return count > 0;
  }

  /**
   * True when the user may act on check-in for an event at all (any point):
   * an organiser of the event's space, or a member with any check-in grant.
   */
  async canManageCheckin(
    userId: string,
    spaceId: string,
    eventId?: string,
  ): Promise<boolean> {
    if (await this.isSpaceOrganiser(userId, spaceId)) return true;

    if (eventId) {
      const grant = await this.prisma.eventCheckinAccess.findFirst({
        where: { eventId, userId },
      });
      if (grant) return true;
    }

    return false;
  }

  /**
   * True when the user may check attendees in at a *specific* point: an
   * organiser (all points), or a grant covering that point (or an "all points"
   * grant where checkinTypeId is null).
   */
  async canCheckinAtType(
    userId: string,
    spaceId: string,
    eventId: string,
    checkinTypeId: string,
  ): Promise<boolean> {
    if (await this.isSpaceOrganiser(userId, spaceId)) return true;
    const grant = await this.prisma.eventCheckinAccess.findFirst({
      where: {
        eventId,
        userId,
        OR: [{ checkinTypeId }, { checkinTypeId: null }],
      },
    });
    return !!grant;
  }

  /**
   * A registration may only be checked in when it's a confirmed attendee — the
   * same bar (`COUNTS_AS_ATTENDING`) used for every other headcount in the app.
   * This blocks scanning in someone who hasn't paid (PENDING) or is still on the
   * waiting list, which would otherwise flip them to ATTENDED and award coins.
   */
  private assertCheckinable(registration: {
    status: RegistrationStatus;
    isWaitlisted: boolean;
    paymentStatus: PaymentStatus;
    event?: { status: EventStatus } | null;
  }) {
    const reason = this.checkinBlockReason(registration);
    if (reason) throw new BadRequestException(reason);
  }

  /**
   * Why a registration can't be checked in, or null when it can. Pure, so the
   * offline roster computes the exact same verdict the live scan would.
   */
  private checkinBlockReason(registration: {
    status: RegistrationStatus;
    isWaitlisted: boolean;
    paymentStatus: PaymentStatus;
    event?: { status: EventStatus } | null;
  }): string | null {
    // Check-in closes when the event is over. This backstops the list filter in
    // getMyCheckinEvents: even if a scanner was left open when the event flipped
    // to COMPLETED (or CANCELLED), the scan/manual/group endpoints all funnel
    // through here, so a finished event can't take any more check-ins.
    const eventStatus = registration.event?.status;
    if (
      eventStatus === EventStatus.COMPLETED ||
      eventStatus === EventStatus.CANCELLED
    ) {
      return 'This event has ended and is no longer accepting check-ins';
    }
    if (registration.status === RegistrationStatus.CANCELLED) {
      return 'Registration has been cancelled';
    }
    if (registration.isWaitlisted) {
      return 'This registration is on the waiting list and cannot be checked in';
    }
    if (
      registration.paymentStatus !== PaymentStatus.PAID &&
      registration.paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED
    ) {
      return 'This registration is not paid and cannot be checked in';
    }
    return null;
  }

  /** Include a registration's context needed to record a check-in. */
  private readonly regInclude = {
    event: { select: { id: true, title: true, spaceId: true, status: true } },
    user: {
      select: { id: true, fullName: true, username: true, avatarUrl: true },
    },
    ticketType: { select: { name: true } },
  };

  /**
   * Scan a QR code (registration or ticket) and check the attendee in at the
   * given check-in point.
   */
  async scanQRCode(
    userId: string,
    qrCode: string,
    checkinTypeId: string,
    groupAware = false,
  ) {
    let registration = await this.prisma.eventRegistration.findUnique({
      where: { qrCode },
      include: this.regInclude,
    });

    if (!registration) {
      const ticket = await this.prisma.eventTicket.findUnique({
        where: { qrCode },
        include: { registration: { include: this.regInclude } },
      });
      if (!ticket) throw new NotFoundException('Invalid QR code');
      registration = ticket.registration;
    }

    // A group shares one QR. For group-aware clients, return the member roster
    // so the scanner can pick who's present. Older clients (groupAware=false)
    // keep the legacy behaviour: one scan checks the whole group in.
    if (groupAware && this.isGroupRegistration(registration)) {
      const view = await this.buildGroupCheckinView(
        userId,
        registration,
        checkinTypeId,
      );
      // No roster to show (a group with neither seats nor a stored member
      // list) → fall through to the single whole-group check-in.
      if (view) return view;
    }

    return this.recordCheckin(userId, registration, checkinTypeId);
  }

  /**
   * A group registration: booked for more than one seat. The roster itself may
   * come from `GroupSeat` rows (fast-registration Part 2, incl. pay-first groups
   * with no upfront member list) or the legacy `groupMembers` JSON.
   */
  private isGroupRegistration(registration: any): boolean {
    return (registration?.groupSize ?? 0) > 1;
  }

  /** name/email for a claimed seat, from its details or the claimer's account. */
  private seatIdentity(seat: {
    memberDetails: unknown;
    claimedBy?: { fullName: string | null; username: string | null } | null;
  }): { name: string | null; email: string | null } {
    const fromDetails = this.memberIdentity(seat.memberDetails);
    if (fromDetails.name || fromDetails.email) return fromDetails;
    const name =
      seat.claimedBy?.fullName || seat.claimedBy?.username || null;
    return { name, email: fromDetails.email };
  }

  /** name/email for a member row, tolerant of older stored shapes. */
  private memberIdentity(m: any): { name: string | null; email: string | null } {
    const flat: Record<string, any> = { ...(m ?? {}) };
    if (m?.customFields && typeof m.customFields === 'object') {
      Object.assign(flat, m.customFields);
    }
    const pick = (keys: string[]): string | null => {
      for (const [k, v] of Object.entries(flat)) {
        if (keys.includes(k.toLowerCase()) && v != null && String(v).trim())
          return String(v);
      }
      return null;
    };
    return { name: pick(['name', 'fullname']), email: pick(['email']) };
  }

  /**
   * Validate the point + the scanner's authority, then return the group's
   * member roster with each member's check-in status at THIS point — the data
   * the scanner needs to render its "who's here?" modal. Does NOT check anyone
   * in; that happens on submit via checkinGroupMembers.
   */
  private async buildGroupCheckinView(
    userId: string,
    registration: any,
    checkinTypeId: string,
  ) {
    await this.assertCanCheckin(userId, registration, checkinTypeId);

    const done = await this.prisma.eventGroupMemberCheckin.findMany({
      where: { registrationId: registration.id, checkinTypeId },
      select: { memberIndex: true, checkedInAt: true },
    });
    const doneByIndex = new Map(done.map((d) => [d.memberIndex, d.checkedInAt]));

    // Prefer GroupSeat rows: they're the source of truth for pay-first groups
    // (which have no `groupMembers` JSON) and carry per-seat claim status.
    const seats = await this.prisma.groupSeat.findMany({
      where: { registrationId: registration.id },
      orderBy: { seatIndex: 'asc' },
      select: {
        seatIndex: true,
        status: true,
        memberDetails: true,
        claimedBy: { select: { fullName: true, username: true } },
      },
    });

    let members: Array<{
      index: number;
      seatIndex: number;
      status: GroupSeatStatus | null;
      claimable: boolean;
      name: string | null;
      email: string | null;
      checkedInAtPoint: string | null;
    }>;

    if (seats.length > 0) {
      members = seats.map((s) => {
        // memberIndex is 0-based; the backfill set seat_index = member_index + 1.
        const index = s.seatIndex - 1;
        const claimable = s.status === GroupSeatStatus.CLAIMED;
        const { name, email } = this.seatIdentity(s);
        return {
          index,
          seatIndex: s.seatIndex,
          status: s.status,
          claimable,
          name,
          email,
          checkedInAtPoint: doneByIndex.get(index)?.toISOString() ?? null,
        };
      });
    } else if (
      Array.isArray(registration.groupMembers) &&
      registration.groupMembers.length > 0
    ) {
      // Legacy fallback: registrations booked before seats existed and never
      // backfilled. Every stored member is checkable.
      members = (registration.groupMembers as any[]).map((m, index) => {
        const { name, email } = this.memberIdentity(m);
        return {
          index,
          seatIndex: index + 1,
          status: null,
          claimable: true,
          name,
          email,
          checkedInAtPoint: doneByIndex.get(index)?.toISOString() ?? null,
        };
      });
    } else {
      // Nothing to show — let the caller fall back to a single check-in.
      return null;
    }

    return {
      isGroup: true as const,
      registrationId: registration.id,
      eventTitle: registration.event.title,
      ticketType: registration.ticketType?.name || 'RSVP',
      groupSize: registration.groupSize ?? members.length,
      leadName:
        registration.user?.fullName || registration.user?.username || null,
      members,
    };
  }

  /** Shared guard: the point belongs to the event and the user may work it. */
  private async assertCanCheckin(
    userId: string,
    registration: any,
    checkinTypeId: string,
  ) {
    const checkinType = await this.prisma.eventCheckinType.findFirst({
      where: { id: checkinTypeId, eventId: registration.event.id },
      select: { id: true, name: true },
    });
    if (!checkinType) {
      throw new BadRequestException('Invalid check-in point for this event');
    }
    if (
      !(await this.canCheckinAtType(
        userId,
        registration.event.spaceId,
        registration.event.id,
        checkinTypeId,
      ))
    ) {
      throw new BadRequestException(
        'You are not authorized to check in at this point',
      );
    }
    this.assertCheckinable(registration);
    return checkinType;
  }

  /**
   * Check the selected group members in at a point. Idempotent per member.
   * The registration-level check-in record still tracks the group as a whole:
   * the first member checked in (at any point) flips the registration to
   * ATTENDED, marks tickets used, and awards attendance coins once — to the
   * lead, since members have no accounts.
   */
  async checkinGroupMembers(
    userId: string,
    registrationId: string,
    checkinTypeId: string,
    memberIndexes: number[],
    /** When the check-in happened (offline sync); defaults to now. */
    at: Date = new Date(),
  ) {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: this.regInclude,
    });
    if (!registration) throw new NotFoundException('Registration not found');
    if (!this.isGroupRegistration(registration)) {
      throw new BadRequestException('Not a group registration');
    }

    const checkinType = await this.assertCanCheckin(
      userId,
      registration,
      checkinTypeId,
    );

    // Seats are the source of truth when present; only CLAIMED seats may be
    // checked in (OPEN/INVITED seats have no attendee behind them). Fall back to
    // the legacy JSON roster for un-backfilled groups.
    const seats = await this.prisma.groupSeat.findMany({
      where: { registrationId },
      orderBy: { seatIndex: 'asc' },
      select: { id: true, seatIndex: true, status: true },
    });
    const seatByIndex = new Map(seats.map((s) => [s.seatIndex - 1, s]));
    const memberCount =
      seats.length > 0
        ? seats.length
        : (registration.groupMembers as any[] | null)?.length ?? 0;

    const indexes = Array.from(new Set(memberIndexes));
    if (indexes.some((i) => i < 0 || i >= memberCount)) {
      throw new BadRequestException('Invalid member selection');
    }
    if (seats.length > 0) {
      const unclaimed = indexes.find(
        (i) => seatByIndex.get(i)?.status !== GroupSeatStatus.CLAIMED,
      );
      if (unclaimed !== undefined) {
        throw new BadRequestException(
          'That seat has not been claimed yet and cannot be checked in',
        );
      }
    }

    const isFirstEver = !registration.checkedInAt;

    // Members already in at this point (by anyone) — skipped below, and
    // reported so an offline sync can flag a ticket scanned on two devices.
    const alreadyIn = (
      await this.prisma.eventGroupMemberCheckin.findMany({
        where: { registrationId, checkinTypeId, memberIndex: { in: indexes } },
        select: {
          memberIndex: true,
          checkedInAt: true,
          checkedInBy: true,
          checkedInByUser: { select: { fullName: true, username: true } },
        },
      })
    ).map((m) => ({
      memberIndex: m.memberIndex,
      checkedInAt: m.checkedInAt,
      checkedInById: m.checkedInBy,
      checkedInByName: m.checkedInByUser?.fullName || m.checkedInByUser?.username || null,
    }));

    await this.prisma.$transaction(async (tx) => {
      await tx.eventGroupMemberCheckin.createMany({
        data: indexes.map((memberIndex) => ({
          registrationId,
          memberIndex,
          // Link the check-in to its seat (null for legacy JSON-only groups).
          groupSeatId: seatByIndex.get(memberIndex)?.id ?? null,
          checkinTypeId,
          checkedInBy: userId,
          checkedInAt: at,
        })),
        skipDuplicates: true, // re-checking an already-in member is a no-op
      });

      // Keep the registration-level record so existing stats + the ATTENDED /
      // coins flow still treat the group as checked in (once ≥1 member is in).
      await tx.eventCheckinRecord.upsert({
        where: {
          registrationId_checkinTypeId: { registrationId, checkinTypeId },
        },
        create: { registrationId, checkinTypeId, checkedInBy: userId, checkedInAt: at },
        update: {},
      });

      if (isFirstEver) {
        await tx.eventRegistration.update({
          where: { id: registrationId },
          data: {
            checkedInAt: at,
            checkedInBy: userId,
            status: RegistrationStatus.ATTENDED,
          },
        });
        await tx.eventTicket.updateMany({
          where: { registrationId },
          data: { status: TicketStatus.USED, checkedInAt: at },
        });
      }
    });

    // Return the refreshed roster for this point (seat-aware, matching the
    // shape of buildGroupCheckinView).
    const refreshed = await this.buildGroupCheckinView(
      userId,
      registration,
      checkinTypeId,
    );

    return {
      success: true,
      registrationId,
      checkinType: checkinType.name,
      checkedInCount: refreshed
        ? refreshed.members.filter((m) => m.checkedInAtPoint).length
        : indexes.length,
      total: memberCount,
      members: refreshed?.members ?? [],
      alreadyIn,
    };
  }

  /**
   * Record a check-in of a registration at a check-in point. Idempotent per
   * (registration, point). The first-ever check-in also flips the registration
   * to ATTENDED and awards the attendance coins (once).
   */
  private async recordCheckin(
    userId: string,
    registration: any,
    checkinTypeId: string,
    /** When the check-in happened (offline sync); defaults to now. */
    at: Date = new Date(),
  ) {
    const checkinType = await this.prisma.eventCheckinType.findFirst({
      where: { id: checkinTypeId, eventId: registration.event.id },
      select: { id: true, name: true },
    });
    if (!checkinType) {
      throw new BadRequestException('Invalid check-in point for this event');
    }

    if (
      !(await this.canCheckinAtType(
        userId,
        registration.event.spaceId,
        registration.event.id,
        checkinTypeId,
      ))
    ) {
      throw new BadRequestException(
        'You are not authorized to check in at this point',
      );
    }

    this.assertCheckinable(registration);

    const attendee = registration.user;
    const ticketType = registration.ticketType?.name || 'RSVP';

    const existing = await this.prisma.eventCheckinRecord.findUnique({
      where: {
        registrationId_checkinTypeId: {
          registrationId: registration.id,
          checkinTypeId,
        },
      },
      include: { checkedInByUser: { select: { fullName: true, username: true } } },
    });
    if (existing) {
      return {
        alreadyCheckedIn: true,
        checkedInAt: existing.checkedInAt,
        checkedInById: existing.checkedInBy,
        checkedInByName:
          existing.checkedInByUser?.fullName || existing.checkedInByUser?.username || null,
        attendee,
        ticketType,
        checkinType: checkinType.name,
      };
    }

    const isFirstEver = !registration.checkedInAt;

    await this.prisma.$transaction(async (tx) => {
      await tx.eventCheckinRecord.create({
        data: {
          registrationId: registration.id,
          checkinTypeId,
          checkedInBy: userId,
          checkedInAt: at,
        },
      });
      if (isFirstEver) {
        await tx.eventRegistration.update({
          where: { id: registration.id },
          data: {
            checkedInAt: at,
            checkedInBy: userId,
            status: RegistrationStatus.ATTENDED,
          },
        });
        await tx.eventTicket.updateMany({
          where: { registrationId: registration.id },
          data: { status: TicketStatus.USED, checkedInAt: at },
        });
      }
    });

    this.logger.log(
      `Checked in registration ${registration.id} at point ${checkinType.name}`,
    );

    return {
      success: true,
      checkedInAt: at,
      attendee,
      ticketType,
      checkinType: checkinType.name,
    };
  }

  /** Manual check-in of a known registration at a point (no QR). */
  async manualCheckin(
    userId: string,
    registrationId: string,
    checkinTypeId: string,
  ) {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: this.regInclude,
    });
    if (!registration) throw new NotFoundException('Registration not found');
    return this.recordCheckin(userId, registration, checkinTypeId);
  }

  async getEventRegistrationsForOffline(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const canManage = await this.canManageCheckin(userId, event.spaceId, event.id);

    if (!canManage) {
      throw new BadRequestException('Unauthorized');
    }

    // Try to get from cache first
    const cachedData = await this.cache.getEventRegistrationsForCheckin(eventId);
    if (cachedData) {
      return {
        eventId,
        eventTitle: event.title,
        registrations: cachedData,
        totalCount: cachedData.length,
        checkedInCount: cachedData.filter((r: any) => r.checkedInAt).length,
        fromCache: true,
      };
    }

    // Fetch from DB and cache
    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        eventId,
        status: {
          in: [RegistrationStatus.REGISTERED, RegistrationStatus.ATTENDED],
        },
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            avatarUrl: true,
          },
        },
        ticketType: {
          select: {
            id: true,
            name: true,
            price: true,
            currency: true,
          },
        },
        tickets: true,
        checkedInByUser: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },
        checkinRecords: {
          include: {
            checkinType: {
              select: {
                id: true,
                name: true,
              },
            },
            checkedInByUser: {
              select: {
                id: true,
                fullName: true,
                username: true,
              },
            },
          },
          orderBy: {
            checkedInAt: 'desc',
          },
        },
      },
    });

    // Set cache for next time
    await this.cache.setEventRegistrationsForCheckin(eventId, registrations);

    return {
      eventId,
      eventTitle: event.title,
      registrations,
      totalCount: registrations.length,
      checkedInCount: registrations.filter((r) => r.checkedInAt).length,
      fromCache: false,
    };
  }

  /**
   * Compact guest list a scanner downloads so it can keep checking people in
   * with no network. Read fresh from the DB, never the Redis snapshot: a stale
   * list is exactly what lets a cancelled ticket through the door. Names only;
   * no emails, phones or form answers are handed out for offline storage.
   *
   * Lists confirmed attendees plus cancelled registrations (so a cancelled
   * ticket reads as "cancelled", not "unknown"). Each entry carries the same
   * block reason a live scan would give, and who is already in at which point.
   * `cursor` is what the scanner passes to getRosterChanges next.
   */
  async getOfflineRoster(userId: string, eventId: string) {
    const event = await this.assertRosterAccess(userId, eventId);
    const cursor = this.rosterCursor();
    const entries = await this.loadRosterEntries(event, { eventId });
    return {
      eventId,
      eventTitle: event.title,
      generatedAt: new Date().toISOString(),
      cursor,
      entries,
    };
  }

  /** Changed registrations beyond this → the scanner re-downloads the whole list. */
  private static readonly ROSTER_DELTA_LIMIT = 1000;

  /**
   * Everything that changed on the guest list since `since` (a cursor from
   * the last roster/changes call): new, cancelled, paid or restored
   * registrations, seat claims, and check-ins stored by any crew device —
   * including offline scans synced late. Returns whole entries in the roster
   * shape, which the scanner swaps in; `removed` are registrations that no
   * longer belong on the list. With too many changes it asks for a full
   * download instead (`full: true`).
   */
  async getRosterChanges(userId: string, eventId: string, since: string) {
    const sinceDate = new Date(since);
    if (Number.isNaN(sinceDate.getTime())) {
      throw new BadRequestException('Invalid `since` cursor');
    }
    const event = await this.assertRosterAccess(userId, eventId);
    const cursor = this.rosterCursor();
    const gt = { gt: sinceDate };

    const [regs, records, members, seats] = await Promise.all([
      this.prisma.eventRegistration.findMany({
        where: { eventId, updatedAt: gt },
        select: { id: true },
      }),
      this.prisma.eventCheckinRecord.findMany({
        where: { recordedAt: gt, registration: { eventId } },
        select: { registrationId: true },
      }),
      this.prisma.eventGroupMemberCheckin.findMany({
        where: { recordedAt: gt, registration: { eventId } },
        select: { registrationId: true },
      }),
      this.prisma.groupSeat.findMany({
        where: { updatedAt: gt, registration: { eventId } },
        select: { registrationId: true },
      }),
    ]);
    const ids = Array.from(
      new Set([
        ...regs.map((r) => r.id),
        ...records.map((r) => r.registrationId),
        ...members.map((r) => r.registrationId),
        ...seats.map((r) => r.registrationId),
      ]),
    );

    if (ids.length > CheckinService.ROSTER_DELTA_LIMIT) {
      return { cursor, full: true as const, entries: [], removed: [] };
    }
    const entries = ids.length
      ? await this.loadRosterEntries(event, { eventId, id: { in: ids } })
      : [];
    const kept = new Set(entries.map((e) => e.registrationId));
    return {
      cursor,
      full: false as const,
      entries,
      removed: ids.filter((id) => !kept.has(id)),
    };
  }

  /**
   * Cursor for the next changes call. Taken before reading and pulled back a
   * few seconds so a write committing mid-read is picked up next time. Some
   * entries come back twice; swapping an entry in again changes nothing.
   */
  private rosterCursor(): string {
    return new Date(Date.now() - 5_000).toISOString();
  }

  private async assertRosterAccess(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, spaceId: true, status: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (!(await this.canManageCheckin(userId, event.spaceId, event.id))) {
      throw new ForbiddenException('You do not have check-in access for this event');
    }
    return event;
  }

  /** Roster entries for the matching registrations (confirmed + cancelled only). */
  private async loadRosterEntries(
    event: { status: EventStatus },
    where: Prisma.EventRegistrationWhereInput,
  ) {
    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        AND: [where, { OR: [COUNTS_AS_ATTENDING, { status: RegistrationStatus.CANCELLED }] }],
      },
      select: {
        id: true,
        qrCode: true,
        status: true,
        isWaitlisted: true,
        paymentStatus: true,
        groupSize: true,
        groupMembers: true,
        user: { select: { fullName: true, username: true } },
        ticketType: { select: { name: true } },
        tickets: { select: { qrCode: true } },
        checkinRecords: { select: { checkinTypeId: true, checkedInAt: true } },
        groupMemberCheckins: {
          select: { memberIndex: true, checkinTypeId: true, checkedInAt: true },
        },
        groupSeats: {
          orderBy: { seatIndex: 'asc' },
          select: {
            seatIndex: true,
            status: true,
            memberDetails: true,
            claimedBy: { select: { fullName: true, username: true } },
          },
        },
      },
    });

    const byPoint = (rows: { checkinTypeId: string; checkedInAt: Date }[]) =>
      Object.fromEntries(rows.map((r) => [r.checkinTypeId, r.checkedInAt.toISOString()]));

    return registrations.map((r) => {
      const name = r.user?.fullName || r.user?.username || null;

      let group: {
        members: {
          index: number;
          name: string | null;
          claimable: boolean;
          checkins: Record<string, string>;
        }[];
      } | null = null;
      if (this.isGroupRegistration(r)) {
        const memberCheckins = (index: number) =>
          byPoint(r.groupMemberCheckins.filter((c) => c.memberIndex === index));
        // Same roster rules as buildGroupCheckinView: seats first, legacy JSON after.
        if (r.groupSeats.length > 0) {
          group = {
            members: r.groupSeats.map((seat) => {
              const index = seat.seatIndex - 1;
              return {
                index,
                name: this.seatIdentity(seat).name,
                claimable: seat.status === GroupSeatStatus.CLAIMED,
                checkins: memberCheckins(index),
              };
            }),
          };
        } else if (Array.isArray(r.groupMembers) && r.groupMembers.length > 0) {
          group = {
            members: (r.groupMembers as any[]).map((m, index) => ({
              index,
              name: this.memberIdentity(m).name,
              claimable: true,
              checkins: memberCheckins(index),
            })),
          };
        }
      }

      return {
        registrationId: r.id,
        codes: [r.qrCode, ...r.tickets.map((t) => t.qrCode).filter(Boolean)],
        name,
        ticketType: r.ticketType?.name || 'RSVP',
        blockedReason: this.checkinBlockReason({ ...r, event }),
        checkins: byPoint(r.checkinRecords),
        group,
      };
    });
  }

  /** Offline scans older than this are stamped with the sync time instead. */
  private static readonly OFFLINE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  /**
   * Replay check-ins a scanner recorded while offline. Items are applied in
   * order through the same paths as a live scan, so every rule (point access,
   * cancelled/unpaid, event ended, unclaimed seat) is re-checked against the
   * current state. Both paths are idempotent, so a batch retried after a
   * dropped response is harmless.
   *
   * Each item gets its own verdict: `ok`, `already` (someone else got them in
   * first) or `rejected` (a rule failed; the client surfaces these for
   * review). An unexpected error fails the whole request so the client keeps
   * the batch and retries.
   */
  async syncOfflineCheckins(
    userId: string,
    eventId: string,
    items: {
      id: string;
      registrationId: string;
      checkinTypeId: string;
      memberIndexes?: number[];
      scannedAt: string;
    }[],
  ) {
    const results: {
      id: string;
      status: 'ok' | 'already' | 'rejected';
      message?: string;
      name?: string | null;
      /**
       * Set when someone else (another device, or a live scan) had already
       * checked this ticket in at the point. A replay of this same item after
       * a dropped response carries the identical scan time and is not flagged.
       */
      duplicateOf?: {
        checkedInAt: string;
        checkedInByName: string | null;
        byYou: boolean;
        memberIndexes?: number[];
      };
    }[] = [];

    for (const item of items) {
      const at = this.offlineCheckinTime(item.scannedAt);
      try {
        const registration = await this.prisma.eventRegistration.findUnique({
          where: { id: item.registrationId },
          include: this.regInclude,
        });
        if (!registration || registration.event.id !== eventId) {
          results.push({ id: item.id, status: 'rejected', message: 'Not a registration for this event' });
          continue;
        }
        const name = registration.user?.fullName || registration.user?.username || null;

        if (item.memberIndexes?.length) {
          const res = await this.checkinGroupMembers(
            userId,
            registration.id,
            item.checkinTypeId,
            item.memberIndexes,
            at,
          );
          const dups = res.alreadyIn.filter((a) => a.checkedInAt.getTime() !== at.getTime());
          const requested = new Set(item.memberIndexes).size;
          const first = dups.sort((a, b) => +a.checkedInAt - +b.checkedInAt)[0];
          results.push({
            id: item.id,
            status: dups.length > 0 && dups.length === requested ? 'already' : 'ok',
            name,
            ...(first
              ? {
                  duplicateOf: {
                    checkedInAt: first.checkedInAt.toISOString(),
                    checkedInByName: first.checkedInByName,
                    byYou: first.checkedInById === userId,
                    memberIndexes: dups.map((d) => d.memberIndex).sort((a, b) => a - b),
                  },
                }
              : {}),
          });
        } else {
          const res = await this.recordCheckin(userId, registration, item.checkinTypeId, at);
          const prior = 'alreadyCheckedIn' in res && res.alreadyCheckedIn ? res : null;
          const duplicate = prior && new Date(prior.checkedInAt).getTime() !== at.getTime();
          results.push({
            id: item.id,
            status: prior ? 'already' : 'ok',
            name,
            ...(duplicate
              ? {
                  duplicateOf: {
                    checkedInAt: new Date(prior.checkedInAt).toISOString(),
                    checkedInByName: prior.checkedInByName,
                    byYou: prior.checkedInById === userId,
                  },
                }
              : {}),
          });
        }
      } catch (e) {
        if (e instanceof HttpException) {
          results.push({ id: item.id, status: 'rejected', message: e.message });
        } else {
          throw e;
        }
      }
    }

    const counts = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});
    this.logger.log(`Offline sync for event ${eventId} by ${userId}: ${JSON.stringify(counts)}`);

    return { results };
  }

  /**
   * The device clock decides when an offline check-in happened, within reason:
   * never in the future, and not further back than OFFLINE_MAX_AGE_MS (a
   * badly-set clock falls back to the sync time).
   */
  private offlineCheckinTime(scannedAt: string): Date {
    const now = Date.now();
    const t = Date.parse(scannedAt);
    if (Number.isNaN(t) || t > now || now - t > CheckinService.OFFLINE_MAX_AGE_MS) {
      return new Date(now);
    }
    return new Date(t);
  }

  async getCheckinStats(userId: string, eventId: string, checkinTypeId?: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const canManage = await this.canManageCheckin(userId, event.spaceId, event.id);

    if (!canManage) {
      throw new BadRequestException('Unauthorized');
    }

    // `total` = confirmed attendees, the same COUNTS_AS_ATTENDING bar that now
    // gates check-in — so the denominator can't include unpaid/waitlisted rows
    // that can never be checked in (which would understate the check-in rate).
    const [total, cancelled] = await Promise.all([
      this.prisma.eventRegistration.count({
        where: { eventId, ...COUNTS_AS_ATTENDING },
      }),
      this.prisma.eventRegistration.count({
        where: { eventId, status: RegistrationStatus.CANCELLED },
      }),
    ]);

    // "Checked in" is counted for the selected point; without a point, it's the
    // number of attendees checked in at least once (registration.checkedInAt).
    const checkedIn = checkinTypeId
      ? await this.prisma.eventCheckinRecord.count({
          where: {
            checkinTypeId,
            registration: {
              status: {
                in: [RegistrationStatus.REGISTERED, RegistrationStatus.ATTENDED],
              },
            },
          },
        })
      : await this.prisma.eventRegistration.count({
          where: { eventId, status: RegistrationStatus.ATTENDED },
        });

    return {
      total,
      checkedIn,
      remaining: total - checkedIn,
      cancelled,
      checkInRate: total > 0 ? ((checkedIn / total) * 100).toFixed(2) : 0,
    };
  }

  async bulkCheckin(userId: string, eventId: string, registrationIds: string[]) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, spaceId: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Bulk check-in records at the event's default (first) point, so the
    // per-point stats and multi-point history stay consistent with scanning.
    await this.ensureDefaultCheckinType(eventId);
    const point = await this.prisma.eventCheckinType.findFirst({
      where: { eventId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    if (!point) {
      throw new BadRequestException('No check-in point available for this event');
    }

    // Scope authority to that point (not merely "any check-in grant").
    if (
      !(await this.canCheckinAtType(userId, event.spaceId, eventId, point.id))
    ) {
      throw new BadRequestException('Unauthorized');
    }

    const results: {
      success: Array<{ id: string; name: string | null }>;
      failed: Array<{ id: string; reason: string }>;
      alreadyCheckedIn: Array<{ id: string; name: string | null }>;
    } = { success: [], failed: [], alreadyCheckedIn: [] };

    for (const regId of registrationIds) {
      try {
        const registration = await this.prisma.eventRegistration.findUnique({
          where: { id: regId },
          include: this.regInclude,
        });
        if (!registration) {
          results.failed.push({ id: regId, reason: 'Not found' });
          continue;
        }
        if (registration.eventId !== eventId) {
          results.failed.push({ id: regId, reason: 'Belongs to another event' });
          continue;
        }

        // Route through the same path as a scan: writes an EventCheckinRecord,
        // enforces attendee eligibility, and awards coins once (idempotently).
        const res = await this.recordCheckin(userId, registration, point.id);
        const name = registration.user.fullName;
        if ('alreadyCheckedIn' in res && res.alreadyCheckedIn) {
          results.alreadyCheckedIn.push({ id: regId, name });
        } else {
          results.success.push({ id: regId, name });
        }
      } catch (error) {
        results.failed.push({ id: regId, reason: error.message });
      }
    }

    this.logger.log(
      `Bulk check-in for event ${eventId}: ${results.success.length} success, ${results.alreadyCheckedIn.length} already, ${results.failed.length} failed`,
    );

    return results;
  }

  // ---------------------------------------------------------------------------
  // Delegated check-in access — organisers grant specific space members the
  // ability to check attendees in for one event.
  // ---------------------------------------------------------------------------

  /** Loads the event or throws, and asserts the caller is a space organiser. */
  private async assertEventOrganiser(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, spaceId: true, title: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (!(await this.isSpaceOrganiser(userId, event.spaceId))) {
      throw new BadRequestException('Only space organisers can manage check-in access');
    }
    return event;
  }

  // ---------------------------------------------------------------------------
  // Check-in points (types) — Entry, Lunch, Day 1, Session A, …
  // ---------------------------------------------------------------------------

  /** Every event has at least one point; seed a default "Entry" if none. */
  private async ensureDefaultCheckinType(eventId: string) {
    const count = await this.prisma.eventCheckinType.count({ where: { eventId } });
    if (count === 0) {
      await this.prisma.eventCheckinType.create({
        data: { eventId, name: 'Entry', order: 0 },
      });
    }
  }

  /** List an event's check-in points (manager-only). */
  async listCheckinTypes(userId: string, eventId: string) {
    const event = await this.assertEventOrganiser(userId, eventId);
    await this.ensureDefaultCheckinType(event.id);
    const types = await this.prisma.eventCheckinType.findMany({
      where: { eventId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, order: true },
    });
    return { types };
  }

  /** Add a check-in point. Organiser-only. */
  async createCheckinType(userId: string, eventId: string, name: string) {
    await this.assertEventOrganiser(userId, eventId);
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Name is required');
    const max = await this.prisma.eventCheckinType.aggregate({
      where: { eventId },
      _max: { order: true },
    });
    return this.prisma.eventCheckinType.create({
      data: { eventId, name: trimmed, order: (max._max.order ?? -1) + 1 },
      select: { id: true, name: true, order: true },
    });
  }

  /** Remove a check-in point (and its records/grants via cascade). Organiser-only. */
  async deleteCheckinType(userId: string, eventId: string, typeId: string) {
    await this.assertEventOrganiser(userId, eventId);
    await this.prisma.eventCheckinType.deleteMany({
      where: { id: typeId, eventId },
    });
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Check-in access — grant event team members access to specific points.
  // ---------------------------------------------------------------------------

  /**
   * Event team members and, for each, which check-in points they can work.
   * `allPoints` is true when they hold an "all points" grant. Organiser-only.
   */
  async listCheckinAccess(userId: string, eventId: string) {
    const event = await this.assertEventOrganiser(userId, eventId);
    await this.ensureDefaultCheckinType(event.id);

    const [team, grants, types] = await Promise.all([
      this.prisma.userRole.findMany({
        where: { eventId },
        include: {
          user: {
            select: { id: true, fullName: true, username: true, avatarUrl: true },
          },
          role: { select: { code: true, name: true } },
        },
      }),
      this.prisma.eventCheckinAccess.findMany({ where: { eventId } }),
      this.prisma.eventCheckinType.findMany({
        where: { eventId },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true },
      }),
    ]);

    const grantsByUser = new Map<string, { typeIds: string[]; all: boolean }>();
    for (const g of grants) {
      const entry = grantsByUser.get(g.userId) ?? { typeIds: [], all: false };
      if (g.checkinTypeId === null) entry.all = true;
      else entry.typeIds.push(g.checkinTypeId);
      grantsByUser.set(g.userId, entry);
    }

    const seen = new Set<string>();
    const members = team
      .filter((m) => (seen.has(m.userId) ? false : (seen.add(m.userId), true)))
      .map((m) => {
        const g = grantsByUser.get(m.userId) ?? { typeIds: [], all: false };
        return {
          userId: m.userId,
          user: m.user,
          role: m.role,
          allPoints: g.all,
          grantedTypeIds: g.typeIds,
        };
      });

    return { eventId, types, members };
  }

  /**
   * Replace a team member's check-in grants. `checkinTypeIds` = "ALL" grants
   * every point, [] revokes all, or a specific list of point ids. Organiser-only.
   */
  async setCheckinAccess(
    userId: string,
    eventId: string,
    targetUserId: string,
    checkinTypeIds: string[] | 'ALL',
  ) {
    await this.assertEventOrganiser(userId, eventId);

    const isTeam = await this.prisma.userRole.count({
      where: { eventId, userId: targetUserId },
    });
    if (!isTeam) {
      throw new BadRequestException('User is not on this event team');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.eventCheckinAccess.deleteMany({
        where: { eventId, userId: targetUserId },
      });
      if (checkinTypeIds === 'ALL') {
        await tx.eventCheckinAccess.create({
          data: { eventId, userId: targetUserId, checkinTypeId: null, grantedBy: userId },
        });
      } else if (checkinTypeIds.length > 0) {
        // Only accept points that belong to this event.
        const valid = await tx.eventCheckinType.findMany({
          where: { eventId, id: { in: checkinTypeIds } },
          select: { id: true },
        });
        await tx.eventCheckinAccess.createMany({
          data: valid.map((t) => ({
            eventId,
            userId: targetUserId,
            checkinTypeId: t.id,
            grantedBy: userId,
          })),
        });
      }
    });

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Manual check-in — search attendees by name / email / phone / ticket id.
  // ---------------------------------------------------------------------------

  async searchRegistrations(
    userId: string,
    eventId: string,
    query: string,
    checkinTypeId?: string,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, spaceId: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (!(await this.canManageCheckin(userId, event.spaceId, event.id))) {
      throw new BadRequestException('Unauthorized');
    }

    const q = query.trim();
    if (q.length < 2) return { results: [] };

    const or: Prisma.EventRegistrationWhereInput[] = [
      { user: { fullName: { contains: q, mode: 'insensitive' } } },
      { user: { username: { contains: q, mode: 'insensitive' } } },
      { user: { mobileNumber: { contains: q } } },
      { user: { identities: { some: { email: { contains: q, mode: 'insensitive' } } } } },
      { qrCode: { contains: q, mode: 'insensitive' } },
      { tickets: { some: { ticketCode: { contains: q, mode: 'insensitive' } } } },
    ];

    // Also match GROUP / TEAM members, not just the registering lead. Their
    // details live in JSONB Prisma cannot substring-search
    // (`event_registrations.group_members` and `group_seats.member_details`),
    // plus a seat's invite email and a claimed seat's own account. We resolve
    // the matching registration ids for this event in one raw query (casting
    // each JSONB to text for a case-insensitive ILIKE) and fold them into the
    // OR, so an organiser can pull up a shared ticket by any teammate's name at
    // the door. The outer `status` filter still constrains the folded ids, so
    // cancelled rows never surface. LIKE metacharacters are escaped.
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const teamMatches = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT DISTINCT r.id
      FROM event_registrations r
      LEFT JOIN group_seats gs ON gs.registration_id = r.id
      LEFT JOIN users cu ON cu.id = gs.claimed_by_user_id
      LEFT JOIN user_identities ci ON ci.user_id = cu.id
      WHERE r.event_id = ${eventId}::uuid
        AND (
          r.group_members::text ILIKE ${like}
          OR gs.member_details::text ILIKE ${like}
          OR gs.invite_email ILIKE ${like}
          OR cu.full_name ILIKE ${like}
          OR cu.username ILIKE ${like}
          OR cu.mobile_number ILIKE ${like}
          OR ci.email ILIKE ${like}
        )
    `);
    if (teamMatches.length > 0) {
      or.push({ id: { in: teamMatches.map((m) => m.id) } });
    }

    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        eventId,
        status: {
          in: [RegistrationStatus.REGISTERED, RegistrationStatus.ATTENDED],
        },
        OR: or,
      },
      take: 15,
      include: {
        user: {
          select: { id: true, fullName: true, username: true, avatarUrl: true },
        },
        ticketType: { select: { name: true } },
        checkinRecords: checkinTypeId
          ? { where: { checkinTypeId }, select: { checkedInAt: true } }
          : false,
      },
    });

    const results = registrations.map((r) => ({
      registrationId: r.id,
      attendee: r.user,
      ticketType: r.ticketType?.name || 'RSVP',
      checkedInAtPoint: checkinTypeId
        ? ((r as any).checkinRecords?.[0]?.checkedInAt ?? null)
        : null,
    }));

    return { results };
  }

  /**
   * Events the user can work check-in for, each with the specific points they
   * are allowed to check attendees in at. Organisers get all points.
   */
  async getMyCheckinEvents(userId: string) {
    const [organiserRoles, grants] = await Promise.all([
      this.prisma.userRole.findMany({
        where: { userId, role: { code: { in: [...SPACE_ADMIN_ROLE_CODES] } } },
        select: { spaceId: true },
      }),
      this.prisma.eventCheckinAccess.findMany({
        where: { userId },
        select: { eventId: true, checkinTypeId: true },
      }),
    ]);

    const spaceIds = [
      ...new Set(organiserRoles.map((r) => r.spaceId).filter(Boolean) as string[]),
    ];
    const grantedEventIds = [...new Set(grants.map((g) => g.eventId))];

    const events = await this.prisma.event.findMany({
      where: {
        ...NOT_DELETED,
        OR: [
          spaceIds.length ? { spaceId: { in: spaceIds } } : undefined,
          grantedEventIds.length ? { id: { in: grantedEventIds } } : undefined,
        ].filter(Boolean) as any,
        // Check-in closes once an event is over. Two conditions, because status
        // alone is unreliable: the markCompletedEvents cron lags by up to an
        // hour, and an ONGOING event whose end time has passed may never flip.
        //   • status excludes COMPLETED / CANCELLED (and DRAFT).
        //   • endDateTime excludes anything already finished by the clock,
        //     regardless of status — this is the authoritative "has it ended".
        status: { in: ['PUBLISHED', 'ONGOING'] },
        endDateTime: { gte: new Date() },
      },
      orderBy: { startDateTime: 'desc' },
      select: {
        id: true,
        title: true,
        slug: true,
        spaceId: true,
        startDateTime: true,
        endDateTime: true,
        coverImageUrl: true,
        venueName: true,
        city: true,
        space: { select: { id: true, name: true } },
        checkinTypes: {
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, name: true },
        },
        _count: { select: { registrations: true } },
      },
    });

    // Uphold the "every event has at least one point" invariant here too: an
    // organiser may reach check-in for an event whose points were never seeded
    // (they never opened the web points screen). Without this, the event would
    // surface with zero points and every check-in would fail with "Invalid
    // check-in point". Only a genuinely empty organiser event triggers a write.
    for (const ev of events) {
      if (ev.checkinTypes.length === 0 && spaceIds.includes(ev.spaceId)) {
        await this.ensureDefaultCheckinType(ev.id);
        ev.checkinTypes = await this.prisma.eventCheckinType.findMany({
          where: { eventId: ev.id },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, name: true },
        });
      }
    }

    // Narrow each event's points to the ones this user may work.
    const withPoints = events.map((ev) => {
      const isOrganiser = spaceIds.includes(ev.spaceId);
      let allowed = ev.checkinTypes;
      if (!isOrganiser) {
        const myGrants = grants.filter((g) => g.eventId === ev.id);
        const all = myGrants.some((g) => g.checkinTypeId === null);
        if (!all) {
          const ids = new Set(
            myGrants.map((g) => g.checkinTypeId).filter(Boolean) as string[],
          );
          allowed = ev.checkinTypes.filter((t) => ids.has(t.id));
        }
      }
      const { spaceId, checkinTypes, ...rest } = ev;
      void spaceId;
      void checkinTypes;
      return { ...rest, checkinTypes: allowed };
    });

    // Drop events where a non-organiser ended up with no workable points.
    return { events: withPoints.filter((e) => e.checkinTypes.length > 0) };
  }
}
