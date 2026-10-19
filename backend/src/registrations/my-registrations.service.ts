import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { enforceFormAnswers } from './form-answers.policy';
import { editWindow } from './attendee-details.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  EventStatus,
  PaymentStatus,
  RegistrationStatus,
  Prisma,
  GroupSeatStatus,
} from '@prisma/client';
import { GroupMemberDto } from './dto';
import { GroupSeatsService } from './group-seats.service';
import { NOT_DELETED } from '../common/soft-delete';
import { resolveRegistrationWhatsAppInvite } from '../common/whatsapp-links';
import { RegistrationConfirmationsService } from './registration-confirmations.service';
import { holdsSeats, seatTicketOf } from './registration.util';

/** The attendee's own tickets: lists, check-ins, group roster edits, WhatsApp group, hiding a ticket. */
@Injectable()
export class MyRegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groupSeats: GroupSeatsService,
    private readonly confirmations: RegistrationConfirmationsService,
  ) {}

  /**
   * Returns the user's first PAID registration for this event, for backward compatibility
   * with callers expecting a single result (e.g. legacy "already registered" checks).
   */
  async getMyRegistration(userId: string, eventId: string) {
    const registrations = await this.getMyRegistrationsForEvent(userId, eventId);
    return registrations[0] || null;
  }

  /**
   * The WhatsApp group invite + my join state for ONE of my registrations,
   * resolved by that registration's ticket type. Keyed by registrationId (not
   * eventId) so a multi-ticket-type attendee gets the exact ticket they're
   * viewing. Ownership-checked.
   */
  async getRegistrationWhatsappGroup(userId: string, registrationId: string) {
    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: {
        id: true,
        userId: true,
        whatsappGroupJoinedAt: true,
        ticketType: { select: { whatsappGroupUrl: true } },
        event: {
          select: {
            whatsappAttendeeGroupUrl: true,
            parentEvent: { select: { whatsappAttendeeGroupUrl: true } },
          },
        },
      },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    // The lead owns the registration; a group member holds a claimed seat on
    // it and gets the same invite on their ticket (they used to get a 403).
    const seat =
      reg.userId === userId ? null : await this.claimedSeatOf(userId, registrationId);
    if (reg.userId !== userId && !seat) throw new ForbiddenException('Unauthorized');

    const { inviteUrl, isCommunity } = resolveRegistrationWhatsAppInvite({
      ticketTypeGroupUrl: reg.ticketType?.whatsappGroupUrl,
      eventAttendeeGroupUrl: reg.event.whatsappAttendeeGroupUrl,
      parentAttendeeGroupUrl: reg.event.parentEvent?.whatsappAttendeeGroupUrl,
    });

    return {
      registrationId: reg.id,
      inviteUrl,
      isCommunity,
      joined: seat ? seat.whatsappJoinedAt != null : reg.whatsappGroupJoinedAt != null,
    };
  }

  /** The seat this user claimed on someone else's group registration, if any. */
  /** When each member was first checked in, by registration id → that member's index. */
  private async myFirstCheckins(memberIndexByReg: Map<string, number>) {
    const first = new Map<string, Date>();
    if (memberIndexByReg.size === 0) return first;
    const rows = await this.prisma.eventGroupMemberCheckin.findMany({
      where: { registrationId: { in: [...memberIndexByReg.keys()] } },
      orderBy: { checkedInAt: 'asc' },
      select: { registrationId: true, memberIndex: true, checkedInAt: true },
    });
    for (const r of rows) {
      if (r.memberIndex === memberIndexByReg.get(r.registrationId) && !first.has(r.registrationId)) {
        first.set(r.registrationId, r.checkedInAt);
      }
    }
    return first;
  }

  private claimedSeatOf(userId: string, registrationId: string) {
    return this.prisma.groupSeat.findFirst({
      where: { registrationId, claimedByUserId: userId, status: GroupSeatStatus.CLAIMED },
      select: { id: true, seatIndex: true, whatsappJoinedAt: true },
    });
  }

  /**
   * Attendee self-marks (or un-marks) that they've joined the event's WhatsApp
   * group from their ticket. This is the only real "joined" signal we have, and
   * setting it suppresses any future curator blast for this registration.
   * A group member marks their own seat instead.
   */
  async setWhatsappGroupJoined(
    userId: string,
    registrationId: string,
    joined: boolean,
  ) {
    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: { id: true, userId: true },
    });
    if (!reg) throw new NotFoundException('Registration not found');

    if (reg.userId !== userId) {
      const seat = await this.claimedSeatOf(userId, registrationId);
      if (!seat) throw new ForbiddenException('Unauthorized');
      const updated = await this.prisma.groupSeat.update({
        where: { id: seat.id },
        data: { whatsappJoinedAt: joined ? new Date() : null },
        select: { whatsappJoinedAt: true },
      });
      return { id: reg.id, whatsappGroupJoinedAt: updated.whatsappJoinedAt };
    }

    const updated = await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: { whatsappGroupJoinedAt: joined ? new Date() : null },
      select: { id: true, whatsappGroupJoinedAt: true },
    });
    return updated;
  }

  /**
   * Returns ALL of the user's PAID registrations for this event — a user may now hold
   * multiple registrations for the same event as long as each is for a distinct ticket type.
   */
  async getMyRegistrationsForEvent(userId: string, eventId: string) {
    // Live tickets only: a cancelled one keeps paymentStatus PAID, and used to
    // make the event page say "View ticket" (and block re-buying). A partial
    // refund leaves the ticket valid.
    const live = {
      status: { not: RegistrationStatus.CANCELLED },
      paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] },
    };
    // Seats I claimed in someone else's group: that group's registration is
    // my ticket for the event too (the event page must say "View ticket").
    const claimedSeats = await this.prisma.groupSeat.findMany({
      where: {
        claimedByUserId: userId,
        status: GroupSeatStatus.CLAIMED,
        registration: { eventId, userId: { not: userId }, ...live },
      },
      select: { registrationId: true, claimedAt: true, seatIndex: true },
    });
    const seatByReg = new Map(claimedSeats.map((c) => [c.registrationId, c]));

    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        eventId,
        ...live,
        OR: [{ userId }, ...(seatByReg.size ? [{ id: { in: [...seatByReg.keys()] } }] : [])],
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
            startDateTime: true,
            endDateTime: true,
            venueName: true,
            city: true,
            // WhatsApp attendee-group invite: ticket-type group, else the event's
            // attendee group, else the parent's. Mirrors the registration push.
            whatsappAttendeeGroupUrl: true,
            parentEvent: { select: { whatsappAttendeeGroupUrl: true } },
          },
        },
        ticketType: true,
        tickets: true,
      },
      orderBy: { registeredAt: 'desc' },
    });

    // Resolve a single "join" link per registration so the mobile ticket page
    // renders one button without re-implementing the precedence rule. The link
    // is per-registration because it depends on the row's ticket type.
    const myEmails = seatByReg.size ? await this.userEmailSet(userId) : new Set<string>();
    const myFirstIn = await this.myFirstCheckins(
      new Map([...seatByReg].map(([regId, s]) => [regId, s.seatIndex - 1])),
    );

    return registrations.map((reg) => {
      const ev = reg.event;
      const { inviteUrl, isCommunity } = resolveRegistrationWhatsAppInvite({
        ticketTypeGroupUrl: reg.ticketType?.whatsappGroupUrl,
        eventAttendeeGroupUrl: ev.whatsappAttendeeGroupUrl,
        parentAttendeeGroupUrl: ev.parentEvent?.whatsappAttendeeGroupUrl,
      });
      const base = {
        ...reg,
        event: {
          ...ev,
          whatsappInviteUrl: inviteUrl,
          whatsappIsCommunity: isCommunity,
        },
      };
      const seat = reg.userId !== userId ? seatByReg.get(reg.id) : undefined;
      if (!seat) return base;
      // A claimed seat: only MY seat ticket (own QR), flagged as a group member.
      return memberView(
        base,
        seatTicketOf(reg.tickets, myEmails, seat.claimedAt),
        myFirstIn.get(reg.id) ?? null,
      );
    });
  }

  /** Lower-cased emails linked to an account. */
  private async userEmailSet(userId: string): Promise<Set<string>> {
    const ids = await this.prisma.userIdentity.findMany({
      where: { userId, email: { not: null } },
      select: { email: true },
    });
    return new Set(ids.map((i) => (i.email ?? '').trim().toLowerCase()).filter(Boolean));
  }

  /**
   * The check-in records for one of the caller's own registrations — one entry
   * per check-in point the attendee passed through, each with the point name,
   * the time, and the staff member (by name) who recorded it. Newest first.
   */
  async getMyRegistrationCheckins(userId: string, registrationId: string) {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: { userId: true, groupSize: true },
    });
    if (!registration) {
      throw new NotFoundException('Registration not found');
    }
    const seat = await this.claimedSeatOf(userId, registrationId);
    if (registration.userId !== userId && !seat) {
      throw new ForbiddenException('Not your registration');
    }

    const select = {
      id: true,
      checkedInAt: true,
      checkinTypeId: true,
      checkinType: { select: { id: true, name: true } },
      checkedInByUser: { select: { fullName: true, username: true } },
    } as const;
    const records = await this.prisma.eventCheckinRecord.findMany({
      where: { registrationId },
      orderBy: { checkedInAt: 'desc' },
      select,
    });
    if ((registration.groupSize ?? 0) <= 1) return records.map(toHistory);

    // A group pass is one person's: only their own member check-ins, never a
    // teammate's. The lead without a claimed seat of their own is member 0.
    const mine = await this.prisma.eventGroupMemberCheckin.findMany({
      where: { registrationId, memberIndex: seat ? seat.seatIndex - 1 : 0 },
      orderBy: { checkedInAt: 'desc' },
      select,
    });
    if (registration.userId !== userId) return mine.map(toHistory);
    // The lead also keeps a whole-group check-in recorded before per-member
    // records existed (a point with a registration record but no member ones).
    const memberPoints = new Set(
      (
        await this.prisma.eventGroupMemberCheckin.findMany({
          where: { registrationId },
          select: { checkinTypeId: true },
          distinct: ['checkinTypeId'],
        })
      ).map((m) => m.checkinTypeId),
    );
    return [...mine, ...records.filter((r) => !memberPoints.has(r.checkinTypeId))]
      .sort((a, b) => +b.checkedInAt - +a.checkedInAt)
      .map(toHistory);
  }

  /**
   * The group roster for one of the caller's own registrations, so the lead can
   * review / complete it from their ticket. Normalises stored members (tolerant
   * of older shapes) to `{ name, email, mobile, gender }`. `editable` is false
   * for non-group registrations. Owner-only.
   */
  async getMyGroupMembers(userId: string, registrationId: string) {
    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: {
        userId: true,
        groupSize: true,
        eventId: true,
        ticketTypeId: true,
      },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    if (reg.userId !== userId) throw new ForbiddenException('Not your registration');

    const groupSize = reg.groupSize ?? 0;

    // GroupSeat rows are the roster (S42). A seatless group (never expected
    // after the backfills) is materialised first so the screen still has slots.
    await this.groupSeats.ensureSeatsForRegistration(registrationId);
    const members = (await this.groupSeats.getRoster(registrationId)) ?? [];

    // eventId + ticketTypeId let the client fetch the event's custom-field
    // definitions and render the per-member "additional information" inputs.
    return {
      groupSize,
      editable: groupSize > 1,
      members,
      eventId: reg.eventId,
      ticketTypeId: reg.ticketTypeId,
    };
  }

  /**
   * Let the group lead set / complete the roster for their own registration.
   * Validates every member (reusing the strict check that rejects empty or
   * array-shaped members), then emails the shared ticket to any newly-added
   * member so they receive it. Owner-only; group registrations only.
   */
  async updateMyGroupMembers(
    userId: string,
    registrationId: string,
    members: (GroupMemberDto | null)[],
  ) {
    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: { event: true, tickets: { take: 1 } },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    if (reg.userId !== userId) throw new BadRequestException('Unauthorized');
    if ((reg.groupSize ?? 0) <= 1) {
      throw new BadRequestException('This is not a group registration');
    }
    // Only a booked group mails tickets to the people typed in (A28).
    if (!holdsSeats(reg)) {
      throw new BadRequestException('This group isn’t booked, so its team can’t change');
    }
    // Same window as every other attendee detail edit: the organiser's switch
    // and deadline, and closed once the event is over or cancelled.
    const edits = editWindow(reg.event);
    if (!edits.open) throw new BadRequestException(edits.reason);

    const roster = this.parseRosterUpdate(members, reg.groupSize as number);

    // Types and limits apply to what the lead types for teammates; required
    // answers aren't forced, since members may complete their own on claim.
    await enforceFormAnswers(this.prisma, {
      eventId: reg.eventId,
      ticketTypeId: reg.ticketTypeId,
      isGroup: true,
      members: roster,
      required: { team: false, members: 'none' },
      uploaderIds: [userId],
    });

    // Write the roster onto GroupSeat rows — the single source of truth. Each
    // filled entry lands on its seat (OPEN → CLAIMED, lead-filled = null claimer);
    // seats a member already claimed, or that have an invite in flight, are left
    // untouched. Returns the members whose seat is newly filled, so we email only
    // those the shared ticket (matching the previous "new member" behaviour).
    const { filledMembers } = await this.groupSeats.applyLeadRoster(
      registrationId,
      userId,
      reg.groupSize as number,
      roster,
    );

    if (filledMembers.length > 0) {
      await this.confirmations.sendGroupMemberConfirmations(
        registrationId,
        reg.event,
        reg.qrCode,
        reg.tickets[0]?.ticketCode,
        null, // don't skip anyone — these are all newly added
        filledMembers,
      );
    }

    return { success: true, groupSize: reg.groupSize, members: roster };
  }

  /**
   * Validate a lead's roster edit. Entries are by seat position; `null` leaves
   * that seat alone. Every non-null entry must be a complete member (the same
   * rules as GroupMemberDto, checked here because the DTO can't nest-validate
   * an array with gaps), and is reduced to the known fields so nothing else
   * lands in the seat's stored details.
   */
  private parseRosterUpdate(
    members: (GroupMemberDto | null)[],
    groupSize: number,
  ): (GroupMemberDto | null)[] {
    if (members.length > groupSize) {
      throw new BadRequestException(
        `A group of ${groupSize} can have at most ${groupSize} members (received ${members.length})`,
      );
    }
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const out = members.map((m, i) => {
      if (m === null || m === undefined) return null;
      if (typeof m !== 'object' || Array.isArray(m)) {
        throw new BadRequestException(
          'Please update the Unifesto app to the latest version to manage your group.',
        );
      }
      const who = `Group member ${i + 1}`;
      const name = text(m.name);
      const email = text(m.email);
      const mobile = text(m.mobile);
      if (!name) throw new BadRequestException(`${who} needs a name`);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new BadRequestException(`${who} needs a valid email`);
      }
      if (!/^[0-9]{10}$/.test(mobile)) {
        throw new BadRequestException(`${who} needs a valid 10-digit mobile number`);
      }
      const custom =
        m.customFields && typeof m.customFields === 'object' && !Array.isArray(m.customFields)
          ? m.customFields
          : undefined;
      return {
        name,
        email,
        mobile,
        ...(typeof m.gender === 'string' ? { gender: m.gender } : {}),
        ...(custom ? { customFields: custom } : {}),
      };
    });
    if (out.every((m) => m === null)) {
      throw new BadRequestException('Add details for at least one member');
    }
    return out;
  }

  /**
   * `scope` splits the attendee's ticket list:
   *   active    (default) — live tickets (paid or partially refunded);
   *             cancelled ones are left out.
   *   cancelled — cancelled tickets, including ones fully refunded.
   */
  async getMyRegistrations(
    userId: string,
    page = 1,
    limit = 20,
    scope: 'active' | 'cancelled' = 'active',
  ) {
    const skip = (page - 1) * limit;

    // A hidden event drops out of the attendee's ticket list. The
    // registration and its payment survive, so restoring the event
    // returns the ticket exactly as it was.
    const where: Prisma.EventRegistrationWhereInput =
      scope === 'cancelled'
        ? {
            userId,
            status: RegistrationStatus.CANCELLED,
            // Tickets I deleted from my list stay out of it.
            hiddenBy: { none: { userId } },
            // Only rows that were ever a real ticket — not abandoned checkouts.
            paymentStatus: {
              in: [
                PaymentStatus.PAID,
                PaymentStatus.PARTIALLY_REFUNDED,
                PaymentStatus.REFUNDED,
              ],
            },
            event: NOT_DELETED,
          }
        : {
            userId,
            // A partial refund leaves the ticket valid, so it stays listed.
            paymentStatus: {
              in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED],
            },
            status: { not: RegistrationStatus.CANCELLED },
            hiddenBy: { none: { userId } },
            event: NOT_DELETED,
          };

    const [registrations, total] = await Promise.all([
      this.prisma.eventRegistration.findMany({
        where,
        skip,
        take: limit,
        orderBy: { registeredAt: 'desc' },
        include: {
          event: {
            select: {
              id: true,
              title: true,
              slug: true,
              coverImageUrl: true,
              startDateTime: true,
              endDateTime: true,
              venueName: true,
              city: true,
              type: true,
              // COMPLETED / CANCELLED drops it out of "Up next" even before its end time.
              status: true,
              // Organiser branding for the "I'm attending" share card.
              space: { select: { id: true, name: true, slug: true, logoUrl: true } },
            },
          },
          ticketType: true,
          tickets: true,
        },
      }),
      this.prisma.eventRegistration.count({ where }),
    ]);

    return {
      data: registrations,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Tickets where the caller is a GROUP MEMBER of someone else's registration
   * (a seat filled with their email, or one they claimed), not the lead. Lets a member see
   * the shared ticket in their own app. Read-only — the registration still
   * belongs to the lead. Excludes the caller's own registrations (they already
   * see those via getMyRegistrations).
   */
  async getMyMemberTickets(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        identities: { where: { email: { not: null } }, select: { email: true } },
      },
    });
    const emails = (user?.identities ?? [])
      .map((i) => i.email)
      .filter((e): e is string => !!e);

    // Seats the lead filled with my email (CLAIMED, no claimer account). JSONB
    // @> containment matches a member object that *contains* {email}, even
    // though it also has name/mobile/etc. Case-sensitive, so emails must match
    // as stored (both are normally lowercase).
    const matchers = emails.map(
      (e) => Prisma.sql`gs.member_details @> ${JSON.stringify({ email: e })}::jsonb`,
    );
    const idRows = emails.length === 0 ? [] : await this.prisma.$queryRaw<{ id: string; seat_index: number }[]>(Prisma.sql`
      SELECT DISTINCT r.id, gs.seat_index FROM event_registrations r
      JOIN group_seats gs ON gs.registration_id = r.id
      WHERE r.payment_status IN ('PAID', 'PARTIALLY_REFUNDED')
        AND r.status <> 'CANCELLED'
        AND r.user_id <> ${userId}::uuid
        AND gs.status = 'CLAIMED'
        AND (${Prisma.join(matchers, ' OR ')})
    `);
    // Seats I claimed from an invite are matched by claimer, not email.
    const claimedSeats = await this.prisma.groupSeat.findMany({
      where: {
        claimedByUserId: userId,
        status: GroupSeatStatus.CLAIMED,
        registration: {
          userId: { not: userId },
          status: { not: RegistrationStatus.CANCELLED },
          paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] },
          event: NOT_DELETED,
        },
      },
      select: { registrationId: true, claimedAt: true, seatIndex: true },
    });
    const seatByReg = new Map(claimedSeats.map((c) => [c.registrationId, c]));

    // My member index on each booking: the seat I claimed, else the seat
    // filled with my email.
    const myIndex = new Map(idRows.map((r) => [r.id, r.seat_index - 1]));
    for (const c of claimedSeats) myIndex.set(c.registrationId, c.seatIndex - 1);

    const ids = [...new Set([...idRows.map((r) => r.id), ...seatByReg.keys()])];
    if (ids.length === 0) return { data: [] };

    const registrations = await this.prisma.eventRegistration.findMany({
      // Shared tickets I deleted from my list stay out of it.
      where: { id: { in: ids }, hiddenBy: { none: { userId } } },
      orderBy: { registeredAt: 'desc' },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
            coverImageUrl: true,
            startDateTime: true,
            endDateTime: true,
            venueName: true,
            city: true,
            type: true,
            status: true,
            // Organiser branding for the "I'm attending" share card.
            space: { select: { id: true, name: true, slug: true, logoUrl: true } },
          },
        },
        ticketType: true,
        tickets: true,
        user: { select: { fullName: true, username: true } },
      },
    });

    const myFirstIn = await this.myFirstCheckins(myIndex);
    const myEmails = new Set(emails.map((e) => e.trim().toLowerCase()));
    return {
      data: registrations.map((r) => {
        const seat = seatByReg.get(r.id);
        // My seat's own ticket + QR (what check-in scans). A teammate the lead
        // typed in before seat tickets existed was mailed the group's QR, so
        // that stays their pass.
        const mine = seatTicketOf(r.tickets, myEmails, seat?.claimedAt ?? null);
        return {
          ...memberView(r, mine, myFirstIn.get(r.id) ?? null),
          ...(!seat && !mine ? { qrCode: r.qrCode } : {}),
          leadName: r.user.fullName || r.user.username || null,
        };
      }),
    };
  }

  /**
   * Deletes a finished ticket from the caller's own ticket list: their own
   * registration or a group ticket they hold a seat on. Only their view
   * changes — the registration, payment and check-ins stay for the organiser
   * and the rest of the group. Allowed once the event is over (ended,
   * completed or cancelled) or the ticket is cancelled, so a live pass can't
   * vanish before the door. Idempotent.
   */
  async hideMyTicket(userId: string, registrationId: string) {
    const already = await this.prisma.hiddenTicket.findUnique({
      where: { userId_registrationId: { userId, registrationId } },
      select: { id: true },
    });
    if (already) return { success: true };

    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: {
        id: true,
        userId: true,
        status: true,
        event: { select: { status: true, endDateTime: true } },
      },
    });
    const mine =
      !!registration &&
      (registration.userId === userId ||
        (await this.getMyMemberTickets(userId)).data.some((r) => r.id === registrationId));
    // Same 404 for "not yours" so ids can't be probed.
    if (!registration || !mine) {
      throw new NotFoundException('Ticket not found');
    }

    const over =
      registration.status === RegistrationStatus.CANCELLED ||
      registration.event.status === EventStatus.COMPLETED ||
      registration.event.status === EventStatus.CANCELLED ||
      registration.event.endDateTime.getTime() <= Date.now();
    if (!over) {
      throw new BadRequestException(
        'You can delete a ticket once its event is over.',
      );
    }

    await this.prisma.hiddenTicket.upsert({
      where: { userId_registrationId: { userId, registrationId } },
      create: { userId, registrationId },
      update: {},
    });
    return { success: true };
  }
}

/** One row of a pass's check-in history. */
function toHistory(r: {
  id: string;
  checkedInAt: Date;
  checkinType: { name: string } | null;
  checkedInByUser: { fullName: string | null; username: string | null } | null;
}) {
  return {
    id: r.id,
    checkedInAt: r.checkedInAt,
    checkinType: r.checkinType?.name ?? null,
    checkedBy: r.checkedInByUser?.fullName || r.checkedInByUser?.username || null,
  };
}

/**
 * What a group member sees of the lead's booking (A28): the event, ticket type
 * and group facts, and their own seat ticket. Never the lead's form answers,
 * payment ids or the teammates' tickets.
 */
function memberView<
  R extends {
    id: string;
    eventId: string;
    ticketTypeId: string | null;
    status: RegistrationStatus;
    paymentStatus: PaymentStatus;
    groupSize: number | null;
    registeredAt: Date;
    checkedInAt: Date | null;
    event: unknown;
    ticketType: unknown;
  },
  T,
>(r: R, mine: (T & { qrCode: string }) | undefined, myCheckedInAt: Date | null) {
  return {
    id: r.id,
    eventId: r.eventId,
    ticketTypeId: r.ticketTypeId,
    // ATTENDED means someone on the booking is in; this member only once
    // they were scanned themselves.
    status:
      r.status === RegistrationStatus.ATTENDED && !myCheckedInAt
        ? RegistrationStatus.REGISTERED
        : r.status,
    paymentStatus: r.paymentStatus,
    groupSize: r.groupSize,
    registeredAt: r.registeredAt,
    checkedInAt: myCheckedInAt,
    event: r.event as R['event'],
    ticketType: r.ticketType as R['ticketType'],
    isGroupMember: true as const,
    qrCode: mine?.qrCode ?? null,
    tickets: mine ? [mine] : [],
  };
}
