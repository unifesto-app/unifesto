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
import {
  EventStatus,
  GroupSeatStatus,
  PaymentStatus,
  Prisma,
  RegistrationStatus,
  TicketStatus,
} from '@prisma/client';
import { Action, AuthorizationService, SPACE_ADMIN_ROLE_CODES } from '../auth/authorization';
import { assertEventCan } from '../events/event-access';
import { NOT_DELETED } from '../common/soft-delete';
import { COUNTS_AS_ATTENDING } from '../common/attendance';

/** See CheckinService.newBatch. */
interface CheckinBatch {
  points: Map<string, Promise<{ id: string; name: string } | null>>;
  allowed: Map<string, Promise<boolean>>;
  regs: Map<string, any>;
  /**
   * Replaying offline scans: a scan made before the event ended still counts
   * after it flips to COMPLETED, and a point deleted since the scan still
   * takes it.
   */
  offline?: boolean;
}

@Injectable()
export class CheckinService {
  private readonly logger = new Logger(CheckinService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly authz: AuthorizationService,
  ) {}

  /**
   * True when the user may act on check-in for an event at all (any point):
   * anyone with the check-in capability (crew up to Space and Platform Admins),
   * or a member with any check-in grant.
   */
  async canManageCheckin(
    userId: string,
    spaceId: string,
    eventId?: string,
  ): Promise<boolean> {
    if (!eventId) return false;
    if (await this.authz.can({ id: userId }, Action.EVENT_CHECK_IN, { eventId })) return true;
    const grant = await this.prisma.eventCheckinAccess.findFirst({
      where: { eventId, userId },
    });
    return !!grant;
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
    if (await this.authz.can({ id: userId }, Action.EVENT_CHECK_IN, { eventId })) return true;
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
   * waiting list, which would otherwise flip them to ATTENDED.
   */
  private assertCheckinable(
    registration: Parameters<CheckinService['checkinBlockReason']>[0],
    offlineScanAt?: Date,
  ) {
    const reason = this.checkinBlockReason(registration, offlineScanAt);
    if (reason) throw new BadRequestException(reason);
  }

  /**
   * Why a registration can't be checked in, or null when it can. Pure, so the
   * offline roster computes the exact same verdict the live scan would.
   * `offlineScanAt` is when a synced offline scan happened: one made before the
   * event's end still counts after the event flipped to COMPLETED.
   */
  private checkinBlockReason(
    registration: {
      status: RegistrationStatus;
      isWaitlisted: boolean;
      paymentStatus: PaymentStatus;
      event?: { status: EventStatus; endDateTime?: Date } | null;
    },
    offlineScanAt?: Date,
  ): string | null {
    // Check-in closes when the event is over. This backstops the list filter in
    // getMyCheckinEvents: even if a scanner was left open when the event flipped
    // to COMPLETED (or CANCELLED), the scan/manual/group endpoints all funnel
    // through here, so a finished event can't take any more check-ins.
    const event = registration.event;
    const scannedInTime =
      !!offlineScanAt && !!event?.endDateTime && offlineScanAt <= event.endDateTime;
    if (
      event?.status === EventStatus.CANCELLED ||
      (event?.status === EventStatus.COMPLETED && !scannedInTime)
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
    event: {
      select: { id: true, title: true, spaceId: true, status: true, endDateTime: true },
    },
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
   * A group registration: booked for more than one seat. The roster lives in
   * `GroupSeat` rows (S42: the old `group_members` JSON column is gone).
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

    // GroupSeat rows are the roster and carry per-seat claim status.
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

  /**
   * Per-request memo for a batch (offline sync, bulk) — one user, one event —
   * so the point lookup and the permission check run once per point instead
   * of once per item.
   */
  private newBatch(): CheckinBatch {
    return { points: new Map(), allowed: new Map(), regs: new Map() };
  }

  private once<T>(
    memo: Map<string, Promise<T>> | undefined,
    key: string,
    load: () => Promise<T>,
  ): Promise<T> {
    if (!memo) return load();
    let hit = memo.get(key);
    if (!hit) {
      hit = load();
      memo.set(key, hit);
    }
    return hit;
  }

  /** One query for every registration a batch names. Callers still check the event. */
  private async preloadRegistrations(batch: CheckinBatch, ids: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return;
    const rows = await this.prisma.eventRegistration.findMany({
      where: { id: { in: unique } },
      include: this.regInclude,
    });
    for (const r of rows) batch.regs.set(r.id, r);
  }

  /** Shared guard: the point belongs to the event, the user may work it, and the registration may be let in. */
  private async assertCanCheckin(
    userId: string,
    registration: any,
    checkinTypeId: string,
    batch?: CheckinBatch,
    /** When the check-in happened (offline sync). */
    at?: Date,
  ) {
    const checkinType = await this.assertPointAccess(userId, registration, checkinTypeId, batch);
    this.assertCheckinable(registration, batch?.offline ? at : undefined);
    return checkinType;
  }

  /** The point belongs to the event (and is live, outside offline replay) and the user may work it. */
  private async assertPointAccess(
    userId: string,
    registration: any,
    checkinTypeId: string,
    batch?: CheckinBatch,
  ) {
    const checkinType = await this.once(batch?.points, checkinTypeId, () =>
      this.prisma.eventCheckinType.findFirst({
        where: {
          id: checkinTypeId,
          eventId: registration.event.id,
          ...(batch?.offline ? {} : { deletedAt: null }),
        },
        select: { id: true, name: true },
      }),
    );
    if (!checkinType) {
      throw new BadRequestException('Invalid check-in point for this event');
    }
    if (
      !(await this.once(batch?.allowed, checkinTypeId, () =>
        this.canCheckinAtType(
          userId,
          registration.event.spaceId,
          registration.event.id,
          checkinTypeId,
        ),
      ))
    ) {
      throw new BadRequestException(
        'You are not authorized to check in at this point',
      );
    }
    return checkinType;
  }

  /**
   * Check the selected group members in at a point. Idempotent per member.
   * The registration-level check-in record still tracks the group as a whole:
   * the first member checked in (at any point) flips the registration to
   * ATTENDED and marks tickets used.
   */
  async checkinGroupMembers(
    userId: string,
    registrationId: string,
    checkinTypeId: string,
    memberIndexes: number[],
    /** When the check-in happened (offline sync); defaults to now. */
    at: Date = new Date(),
    batch?: CheckinBatch,
  ) {
    const registration =
      batch?.regs.get(registrationId) ??
      (await this.prisma.eventRegistration.findUnique({
        where: { id: registrationId },
        include: this.regInclude,
      }));
    if (!registration) throw new NotFoundException('Registration not found');
    if (!this.isGroupRegistration(registration)) {
      throw new BadRequestException('Not a group registration');
    }

    const checkinType = await this.assertCanCheckin(
      userId,
      registration,
      checkinTypeId,
      batch,
      at,
    );

    // Seats are the roster; only CLAIMED seats may be checked in (OPEN/INVITED
    // seats have no attendee behind them).
    const seats = await this.prisma.groupSeat.findMany({
      where: { registrationId },
      orderBy: { seatIndex: 'asc' },
      select: { id: true, seatIndex: true, status: true },
    });
    const seatByIndex = new Map(seats.map((s) => [s.seatIndex - 1, s]));
    const memberCount = seats.length;

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

      // Keep the registration-level record so existing stats + the ATTENDED
      // flow still treat the group as checked in (once ≥1 member is in).
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
    if (isFirstEver) this.markAttended(registration, userId, at);

    if (batch) {
      // The batch caller only reads `alreadyIn`, so skip rebuilding the
      // roster per item.
      return {
        success: true,
        registrationId,
        checkinType: checkinType.name,
        checkedInCount: indexes.length,
        total: memberCount,
        members: [],
        alreadyIn,
      };
    }
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
   * Mirror the first check-in onto the in-memory row, so a later item in the
   * same batch for the same registration doesn't treat it as first-ever again.
   */
  private markAttended(registration: any, userId: string, at: Date) {
    registration.checkedInAt = at;
    registration.checkedInBy = userId;
    registration.status = RegistrationStatus.ATTENDED;
  }

  /**
   * Record a check-in of a registration at a check-in point. Idempotent per
   * (registration, point). The first-ever check-in also flips the registration
   * to ATTENDED.
   *
   * A group is never checked in at registration level alone: callers that
   * don't pick members (bulk, Space web, older scanners) check in every
   * claimed member, stored per member like a door pick, so each member's pass,
   * the export, the stats and seat removal all see who is actually in.
   */
  private async recordCheckin(
    userId: string,
    registration: any,
    checkinTypeId: string,
    /** When the check-in happened (offline sync); defaults to now. */
    at: Date = new Date(),
    batch?: CheckinBatch,
  ) {
    const attendee = registration.user;
    const ticketType = registration.ticketType?.name || 'RSVP';

    if (this.isGroupRegistration(registration)) {
      const seats = await this.prisma.groupSeat.findMany({
        where: { registrationId: registration.id },
        select: { seatIndex: true, status: true },
      });
      // A seatless group (never expected after the S42 backfills) falls
      // through to the single registration-level record.
      if (seats.length > 0) {
        const claimed = seats
          .filter((s) => s.status === GroupSeatStatus.CLAIMED)
          .map((s) => s.seatIndex - 1);
        if (claimed.length === 0) {
          throw new BadRequestException('No one in this group has claimed a seat yet');
        }
        const res = await this.checkinGroupMembers(
          userId,
          registration.id,
          checkinTypeId,
          claimed,
          at,
          batch,
        );
        const first = [...res.alreadyIn].sort((a, b) => +a.checkedInAt - +b.checkedInAt)[0];
        return first && res.alreadyIn.length === claimed.length
          ? {
              alreadyCheckedIn: true as const,
              checkedInAt: first.checkedInAt,
              checkedInById: first.checkedInById,
              checkedInByName: first.checkedInByName,
              attendee,
              ticketType,
              checkinType: res.checkinType,
            }
          : {
              success: true as const,
              checkedInAt: at,
              attendee,
              ticketType,
              checkinType: res.checkinType,
              checkedInCount: claimed.length - res.alreadyIn.length,
            };
      }
    }

    const checkinType = await this.assertCanCheckin(
      userId,
      registration,
      checkinTypeId,
      batch,
      at,
    );

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

    try {
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
    } catch (e) {
      // Two devices (or a scan + a search tap) raced on the same person: the
      // unique (registration, point) key let exactly one win. Report the
      // winner's check-in instead of an error.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const won = await this.prisma.eventCheckinRecord.findUnique({
          where: { registrationId_checkinTypeId: { registrationId: registration.id, checkinTypeId } },
          include: { checkedInByUser: { select: { fullName: true, username: true } } },
        });
        return {
          alreadyCheckedIn: true,
          checkedInAt: won?.checkedInAt ?? at,
          checkedInById: won?.checkedInBy ?? null,
          checkedInByName: won?.checkedInByUser?.fullName || won?.checkedInByUser?.username || null,
          attendee,
          ticketType,
          checkinType: checkinType.name,
        };
      }
      throw e;
    }
    if (isFirstEver) this.markAttended(registration, userId, at);

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

  /**
   * Manual check-in of a known registration at a point (no QR).
   *
   * A group is checked in one member at a time (`memberIndex`, default the
   * lead), through the same per-member records a QR scan writes. Checking the
   * whole registration in here used to leave every member "not in" on the scan
   * roster, so the same people were checked in again at the door.
   */
  async manualCheckin(
    userId: string,
    registrationId: string,
    checkinTypeId: string,
    memberIndex?: number,
  ) {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: this.regInclude,
    });
    if (!registration) throw new NotFoundException('Registration not found');

    if (this.isGroupRegistration(registration)) {
      const index = memberIndex ?? 0;
      const view = await this.buildGroupCheckinView(userId, registration, checkinTypeId);
      const member = view?.members.find((m) => m.index === index);
      if (view && member) {
        const res = await this.checkinGroupMembers(userId, registrationId, checkinTypeId, [index]);
        const before = res.alreadyIn.find((a) => a.memberIndex === index);
        const after = res.members.find((m) => m.index === index);
        const attendee = {
          id: index === 0 ? registration.user?.id ?? null : null,
          fullName: member.name,
          username: index === 0 ? registration.user?.username ?? null : null,
          avatarUrl: index === 0 ? registration.user?.avatarUrl ?? null : null,
        };
        return before
          ? {
              alreadyCheckedIn: true,
              checkedInAt: before.checkedInAt,
              checkedInById: before.checkedInById,
              checkedInByName: before.checkedInByName,
              attendee,
              ticketType: view.ticketType,
              checkinType: res.checkinType,
              memberIndex: index,
            }
          : {
              success: true,
              checkedInAt: after?.checkedInAtPoint ?? new Date().toISOString(),
              attendee,
              ticketType: view.ticketType,
              checkinType: res.checkinType,
              memberIndex: index,
            };
      }
      if (memberIndex !== undefined) {
        throw new BadRequestException('That group member was not found');
      }
      // No roster at all: fall through to the whole-registration check-in.
    }

    return this.recordCheckin(userId, registration, checkinTypeId);
  }

  /**
   * Undo a mistaken check-in at a point: one group member's (memberIndex), or
   * an individual's. Same authority as checking in at that point, but not the
   * attending rule, so a check-in can still be corrected after the event or a
   * cancellation. Every undo is written to EventCheckinUndo.
   *
   * The registration follows what is left: its first check-in moves to the
   * earliest remaining record, and with none left it goes back to REGISTERED
   * and its tickets to ACTIVE. The registration row is always touched, so
   * offline scanners pick the change up on their next roster pull.
   */
  async undoCheckin(
    userId: string,
    registrationId: string,
    checkinTypeId: string,
    memberIndex?: number,
    reason?: string,
  ) {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: this.regInclude,
    });
    if (!registration) throw new NotFoundException('Registration not found');
    const checkinType = await this.assertPointAccess(userId, registration, checkinTypeId);
    const isGroup = this.isGroupRegistration(registration);
    if (memberIndex !== undefined && !isGroup) {
      throw new BadRequestException('Not a group registration');
    }

    await this.prisma.$transaction(async (tx) => {
      let undone: { checkedInAt: Date; checkedInBy: string };
      if (memberIndex !== undefined) {
        const member = await tx.eventGroupMemberCheckin.findUnique({
          where: {
            registrationId_memberIndex_checkinTypeId: { registrationId, memberIndex, checkinTypeId },
          },
        });
        if (!member) throw new NotFoundException('That member is not checked in at this point');
        await tx.eventGroupMemberCheckin.delete({ where: { id: member.id } });
        undone = member;
        // The group's registration-level record at this point stands only
        // while some member is still in there.
        const stillIn = await tx.eventGroupMemberCheckin.count({
          where: { registrationId, checkinTypeId },
        });
        if (stillIn === 0) {
          await tx.eventCheckinRecord.deleteMany({ where: { registrationId, checkinTypeId } });
        }
      } else {
        if (
          isGroup &&
          (await tx.eventGroupMemberCheckin.count({ where: { registrationId, checkinTypeId } })) > 0
        ) {
          throw new BadRequestException('Choose which group member to undo');
        }
        const record = await tx.eventCheckinRecord.findUnique({
          where: { registrationId_checkinTypeId: { registrationId, checkinTypeId } },
        });
        if (!record) throw new NotFoundException('Not checked in at this point');
        await tx.eventCheckinRecord.delete({ where: { id: record.id } });
        undone = record;
      }

      await tx.eventCheckinUndo.create({
        data: {
          registrationId,
          checkinTypeId,
          memberIndex: memberIndex ?? null,
          checkedInAt: undone.checkedInAt,
          checkedInBy: undone.checkedInBy,
          undoneBy: userId,
          reason: reason?.trim() || null,
        },
      });

      const first = await tx.eventCheckinRecord.findFirst({
        where: { registrationId },
        orderBy: { checkedInAt: 'asc' },
        select: { checkedInAt: true, checkedInBy: true },
      });
      await tx.eventRegistration.update({
        where: { id: registrationId },
        data: first
          ? { checkedInAt: first.checkedInAt, checkedInBy: first.checkedInBy }
          : {
              checkedInAt: null,
              checkedInBy: null,
              ...(registration.status === RegistrationStatus.ATTENDED
                ? { status: RegistrationStatus.REGISTERED }
                : {}),
            },
      });
      if (!first) {
        await tx.eventTicket.updateMany({
          where: { registrationId, status: TicketStatus.USED },
          data: { status: TicketStatus.ACTIVE, checkedInAt: null },
        });
      }
    });

    this.logger.log(
      `Undid check-in of registration ${registrationId}` +
        `${memberIndex !== undefined ? ` member ${memberIndex}` : ''} at ${checkinType.name} by ${userId}`,
    );
    return { success: true, registrationId, memberIndex: memberIndex ?? null, checkinType: checkinType.name };
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

    // Always read fresh: an hour-long Redis copy went stale on every claim,
    // team change, transfer, waitlist conversion and manual add.
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

    return {
      eventId,
      eventTitle: event.title,
      registrations,
      totalCount: registrations.length,
      checkedInCount: registrations.filter((r) => r.checkedInAt).length,
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
        // Same roster rules as buildGroupCheckinView: seats only.
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

    const batch: CheckinBatch = { ...this.newBatch(), offline: true };
    await this.preloadRegistrations(
      batch,
      items.map((i) => i.registrationId),
    );

    for (const item of items) {
      const at = this.offlineCheckinTime(item.scannedAt);
      try {
        const registration = batch.regs.get(item.registrationId);
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
            batch,
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
          const res = await this.recordCheckin(userId, registration, item.checkinTypeId, at, batch);
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

    // People, not bookings: an individual counts once, a group counts each
    // seat (bar released ones). Only confirmed attendees (COUNTS_AS_ATTENDING,
    // the bar that gates check-in) are counted, so refunded or unpaid rows
    // never inflate either side. Individuals are checked in at registration
    // level, group members per member; filtering both through this event's
    // registrations also scopes a passed point to the event.
    const attending = { eventId, ...COUNTS_AS_ATTENDING };
    const individuals = { ...attending, OR: [{ groupSize: null }, { groupSize: { lte: 1 } }] };
    const groups = { ...attending, groupSize: { gt: 1 } };
    const [single, seats, cancelled, singleIn, membersIn] = await Promise.all([
      this.prisma.eventRegistration.count({ where: individuals }),
      this.prisma.groupSeat.count({
        where: { status: { not: GroupSeatStatus.RELEASED }, registration: groups },
      }),
      this.prisma.eventRegistration.count({
        where: { eventId, status: RegistrationStatus.CANCELLED },
      }),
      // Without a point: checked in at least once.
      checkinTypeId
        ? this.prisma.eventCheckinRecord.count({
            where: { checkinTypeId, registration: individuals },
          })
        : this.prisma.eventRegistration.count({
            where: { ...individuals, checkedInAt: { not: null } },
          }),
      checkinTypeId
        ? this.prisma.eventGroupMemberCheckin.count({
            where: { checkinTypeId, registration: groups },
          })
        : this.prisma.eventGroupMemberCheckin
            .groupBy({ by: ['registrationId', 'memberIndex'], where: { registration: groups } })
            .then((rows) => rows.length),
    ]);
    const total = single + seats;
    const checkedIn = singleIn + membersIn;

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
      where: { eventId, deletedAt: null },
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

    // One read for every registration instead of one per id.
    const batch = this.newBatch();
    await this.preloadRegistrations(batch, registrationIds);

    for (const regId of registrationIds) {
      try {
        const registration = batch.regs.get(regId);
        if (!registration) {
          results.failed.push({ id: regId, reason: 'Not found' });
          continue;
        }
        if (registration.eventId !== eventId) {
          results.failed.push({ id: regId, reason: 'Belongs to another event' });
          continue;
        }

        // Route through the same path as a scan: enforces attendee
        // eligibility, and checks a group in member by member (idempotently).
        const res = await this.recordCheckin(userId, registration, point.id, undefined, batch);
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

  /** Loads the event or throws, and asserts the caller may assign event crew. */
  private assertEventOrganiser(userId: string, eventId: string) {
    return assertEventCan(
      this.prisma,
      this.authz,
      userId,
      eventId,
      Action.EVENT_ASSIGN_CREW,
      'Only space organisers can manage check-in access',
      { title: true },
    );
  }

  // ---------------------------------------------------------------------------
  // Check-in points (types) — Entry, Lunch, Day 1, Session A, …
  // ---------------------------------------------------------------------------

  /** Every event has at least one point; seed a default "Entry" if none. */
  private async ensureDefaultCheckinType(eventId: string) {
    const count = await this.prisma.eventCheckinType.count({ where: { eventId, deletedAt: null } });
    if (count === 0) {
      await this.prisma.eventCheckinType.create({
        data: { eventId, name: 'Entry', order: 0 },
      });
    }
  }

  /**
   * An event's check-in points. Anyone who can check people in sees them
   * (B15: Crew on web); a member whose grants cover only some points sees
   * just those.
   */
  async listCheckinTypes(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true, spaceId: true } });
    if (!event) throw new NotFoundException('Event not found');
    const allPoints = await this.authz.can({ id: userId }, Action.EVENT_CHECK_IN, { eventId });
    const grants = allPoints
      ? []
      : await this.prisma.eventCheckinAccess.findMany({ where: { eventId, userId }, select: { checkinTypeId: true } });
    if (!allPoints && grants.length === 0) {
      throw new ForbiddenException('You do not have check-in access for this event');
    }
    await this.ensureDefaultCheckinType(event.id);
    const everyPoint = allPoints || grants.some((g) => g.checkinTypeId === null);
    const types = await this.prisma.eventCheckinType.findMany({
      where: {
        eventId,
        deletedAt: null,
        ...(everyPoint ? {} : { id: { in: grants.map((g) => g.checkinTypeId!) } }),
      },
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

  /**
   * Remove a check-in point. Organiser-only. A soft delete: the point stops
   * being listed or scannable live, but its check-in history stays (stats,
   * exports, passes) and offline scans queued against it still sync.
   */
  async deleteCheckinType(userId: string, eventId: string, typeId: string) {
    await this.assertEventOrganiser(userId, eventId);
    await this.prisma.eventCheckinType.updateMany({
      where: { id: typeId, eventId, deletedAt: null },
      data: { deletedAt: new Date() },
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
        where: { eventId, deletedAt: null },
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
          where: { eventId, deletedAt: null, id: { in: checkinTypeIds } },
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
    /** One row per group member (4.0.5+ clients) instead of per registration. */
    expandMembers = false,
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
    // (`group_seats.member_details`),
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
          gs.member_details::text ILIKE ${like}
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
        // Unpaid checkouts can't be checked in, and their typed-in members
        // (seats exist from checkout, S42) must not surface at the door.
        paymentStatus: COUNTS_AS_ATTENDING.paymentStatus,
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

    if (expandMembers) {
      return { results: await this.expandSearchMembers(registrations, q, checkinTypeId) };
    }

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
   * Search results with each group member as their own row (`memberIndex`),
   * so the door sees the teammate they searched for, not the lead, and checks
   * in exactly that person. Members whose name, email or account matches the
   * query are listed; when the group matched some other way (ticket code, the
   * lead's phone) every member is listed. Individuals keep one row.
   */
  private async expandSearchMembers(
    registrations: Array<{
      id: string;
      groupSize: number | null;
      user: { id: string; fullName: string | null; username: string | null; avatarUrl: string | null };
      ticketType: { name: string } | null;
    }>,
    q: string,
    checkinTypeId?: string,
  ) {
    const groupIds = registrations.filter((r) => this.isGroupRegistration(r)).map((r) => r.id);
    // Empty id lists just return no rows; no need to special-case them.
    const [seats, memberCheckins, regCheckins] = await Promise.all([
      this.prisma.groupSeat.findMany({
            where: { registrationId: { in: groupIds } },
            orderBy: { seatIndex: 'asc' },
            select: {
              registrationId: true,
              seatIndex: true,
              status: true,
              memberDetails: true,
              inviteEmail: true,
              claimedBy: {
                select: { id: true, fullName: true, username: true, avatarUrl: true },
              },
            },
          }),
      this.prisma.eventGroupMemberCheckin.findMany({
        where: { registrationId: { in: checkinTypeId ? groupIds : [] }, checkinTypeId },
        select: { registrationId: true, memberIndex: true, checkedInAt: true },
      }),
      this.prisma.eventCheckinRecord.findMany({
        where: {
          registrationId: { in: checkinTypeId ? registrations.map((r) => r.id) : [] },
          checkinTypeId,
        },
        select: { registrationId: true, checkedInAt: true },
      }),
    ]);
    const memberIn = new Map<string, Date>(
      memberCheckins.map((m) => [`${m.registrationId}:${m.memberIndex}`, m.checkedInAt] as const),
    );
    const regIn = new Map<string, Date>(
      regCheckins.map((r) => [r.registrationId, r.checkedInAt] as const),
    );
    const needle = q.toLowerCase();
    const hit = (...vals: Array<string | null | undefined>) =>
      vals.some((v) => !!v && v.toLowerCase().includes(needle));

    type Row = {
      registrationId: string;
      memberIndex: number | null;
      attendee: { id: string | null; fullName: string | null; username: string | null; avatarUrl: string | null };
      ticketType: string;
      checkedInAtPoint: Date | null;
      groupLeadName: string | null;
      /** False for a seat nobody has claimed yet: there's no one to let in. */
      claimable: boolean;
    };
    const rows: Row[] = [];

    for (const r of registrations) {
      const ticketType = r.ticketType?.name || 'RSVP';
      if (!this.isGroupRegistration(r)) {
        rows.push({
          registrationId: r.id,
          memberIndex: null,
          attendee: r.user,
          ticketType,
          checkedInAtPoint: regIn.get(r.id) ?? null,
          groupLeadName: null,
          claimable: true,
        });
        continue;
      }

      const leadName = r.user.fullName || r.user.username || null;
      const regSeats = seats.filter((s) => s.registrationId === r.id);
      const members: Array<Row & { matches: boolean }> = regSeats.map((s) => {
        const index = s.seatIndex - 1;
        const who = this.seatIdentity(s);
        const account = s.claimedBy ?? (index === 0 ? r.user : null);
        return {
          registrationId: r.id,
          memberIndex: index,
          attendee: {
            id: account?.id ?? null,
            fullName: who.name ?? account?.fullName ?? null,
            username: account?.username ?? null,
            avatarUrl: account?.avatarUrl ?? null,
          },
          ticketType,
          checkedInAtPoint: memberIn.get(`${r.id}:${index}`) ?? null,
          groupLeadName: leadName,
          claimable: s.status === GroupSeatStatus.CLAIMED,
          matches: hit(who.name, who.email, s.inviteEmail, account?.fullName, account?.username),
        };
      });

      if (members.length === 0) {
        // No roster stored: the registration is the only thing to check in.
        rows.push({
          registrationId: r.id,
          memberIndex: null,
          attendee: r.user,
          ticketType,
          checkedInAtPoint: regIn.get(r.id) ?? null,
          groupLeadName: null,
          claimable: true,
        });
        continue;
      }
      const matched = members.filter((m) => m.matches);
      for (const { matches: _m, ...row } of matched.length ? matched : members) rows.push(row);
    }

    return rows.slice(0, 30);
  }

  /**
   * The latest check-ins at an event, newest first: individuals and each
   * group member by their own name. Read fresh from the DB (the hub used to
   * read an hour-old Redis snapshot, so new check-ins never showed up).
   * A group checked in as a whole by an older client (a registration record
   * with no member records) shows once, under the lead.
   */
  async getRecentCheckins(
    userId: string,
    eventId: string,
    limit: number,
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

    const by = { select: { fullName: true, username: true } };
    const reg = {
      select: {
        id: true,
        user: { select: { fullName: true, username: true, avatarUrl: true } },
        ticketType: { select: { name: true } },
      },
    };
    const point = { select: { id: true, name: true } };
    const [records, members] = await Promise.all([
      this.prisma.eventCheckinRecord.findMany({
        where: { registration: { eventId }, ...(checkinTypeId ? { checkinTypeId } : {}) },
        orderBy: { checkedInAt: 'desc' },
        take: limit * 2,
        include: { registration: reg, checkinType: point, checkedInByUser: by },
      }),
      this.prisma.eventGroupMemberCheckin.findMany({
        where: { registration: { eventId }, ...(checkinTypeId ? { checkinTypeId } : {}) },
        orderBy: { checkedInAt: 'desc' },
        take: limit,
        include: {
          registration: reg,
          checkinType: point,
          checkedInByUser: by,
          groupSeat: {
            select: { memberDetails: true, claimedBy: { select: { fullName: true, username: true } } },
          },
        },
      }),
    ]);

    // A registration record that has member records at the same point is the
    // group's summary row; the members themselves are listed instead.
    const hasMembers = new Set(members.map((m) => `${m.registrationId}:${m.checkinTypeId}`));
    const byName = (u?: { fullName: string | null; username: string | null } | null) =>
      u?.fullName || u?.username || null;

    const rows = [
      ...records
        .filter((r) => !hasMembers.has(`${r.registrationId}:${r.checkinTypeId}`))
        .map((r) => ({
          id: r.id,
          registrationId: r.registrationId,
          memberIndex: null as number | null,
          name: byName(r.registration.user) ?? 'Attendee',
          avatarUrl: r.registration.user?.avatarUrl ?? null,
          ticketType: r.registration.ticketType?.name ?? null,
          checkinType: r.checkinType,
          checkedInAt: r.checkedInAt,
          checkedBy: byName(r.checkedInByUser),
          groupLeadName: null as string | null,
        })),
      ...members.map((m) => {
        const lead = byName(m.registration.user);
        const who = m.groupSeat ? this.seatIdentity(m.groupSeat).name : null;
        return {
          id: m.id,
          registrationId: m.registrationId,
          memberIndex: m.memberIndex as number | null,
          name: who ?? (m.memberIndex === 0 ? lead : null) ?? `Member ${m.memberIndex + 1}`,
          avatarUrl: m.memberIndex === 0 ? m.registration.user?.avatarUrl ?? null : null,
          ticketType: m.registration.ticketType?.name ?? null,
          checkinType: m.checkinType,
          checkedInAt: m.checkedInAt,
          checkedBy: byName(m.checkedInByUser),
          groupLeadName: lead,
        };
      }),
    ];

    return rows
      .sort((a, b) => b.checkedInAt.getTime() - a.checkedInAt.getTime())
      .slice(0, limit);
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
          where: { deletedAt: null },
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
          where: { eventId: ev.id, deletedAt: null },
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
