import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { enforceFormAnswers } from './form-answers.policy';
import { editWindow } from './attendee-details.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { CacheService } from '../cache/cache.service';
import { RedisService } from '../redis/redis.service';
import { PlanConfigService } from '../subscription/plan-config.service';
import { PlatformConfigService } from '../subscription/platform-config.service';
import { PaymentsService } from '../payments/payments.service';
import { StayBookingsService } from '../stays/stay-bookings.service';
import { TeamChangesService } from './team-changes.service';
import { CouponsService } from '../coupons/coupons.service';
import {
  EventStatus,
  PaymentStatus,
  RegistrationStatus,
  Prisma,
  GroupSeatStatus,
} from '@prisma/client';
import { AuthorizationService } from '../auth/authorization';
import { GroupMemberDto } from './dto';
import { WaitlistService } from './waitlist.service';
import { GroupSeatsService } from './group-seats.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NOT_DELETED } from '../common/soft-delete';
import { resolveRegistrationWhatsAppInvite } from '../common/whatsapp-links';
import { RegistrationConfirmationsService } from './registration-confirmations.service';
import { RegistrationAttendeesService } from './registration-attendees.service';
import { RegistrationTransfersService } from './registration-transfers.service';
import { RegistrationExportService } from './registration-export.service';
import { RegistrationImportService } from './registration-import.service';
import { RegistrationCancellationService } from './registration-cancellation.service';
import { RegistrationPaymentsService } from './registration-payments.service';
import { RegistrationCheckoutService } from './registration-checkout.service';

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly whatsappService: WhatsAppService,
    private readonly cache: CacheService,
    private readonly planConfig: PlanConfigService,
    private readonly platformConfig: PlatformConfigService,
    private readonly payments: PaymentsService,
    private readonly waitlist: WaitlistService,
    private readonly events: EventEmitter2,
    private readonly groupSeats: GroupSeatsService,
    private readonly redis: RedisService,
    private readonly coupons: CouponsService,
    private readonly stayBookings: StayBookingsService,
    private readonly teamChanges: TeamChangesService,
    private readonly authz: AuthorizationService,
    readonly confirmations: RegistrationConfirmationsService,
    readonly attendees: RegistrationAttendeesService,
    readonly transfers: RegistrationTransfersService,
    readonly exporter: RegistrationExportService,
    readonly importer: RegistrationImportService,
    readonly cancellation: RegistrationCancellationService,
    readonly settlement: RegistrationPaymentsService,
    readonly checkout: RegistrationCheckoutService,
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
  private claimedSeatOf(userId: string, registrationId: string) {
    return this.prisma.groupSeat.findFirst({
      where: { registrationId, claimedByUserId: userId, status: GroupSeatStatus.CLAIMED },
      select: { id: true, whatsappJoinedAt: true },
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
      select: { registrationId: true, claimedAt: true },
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
      // A claimed seat: show MY seat ticket (own QR), flagged as a group member.
      const mine = this.pickSeatTicket(reg.tickets, myEmails, seat.claimedAt);
      return {
        ...base,
        isGroupMember: true,
        ...(mine ? { qrCode: mine.qrCode, tickets: [mine] } : {}),
      };
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
   * Which of a group registration's tickets belongs to a member who claimed a
   * seat: the one stamped with their email (newer claims), else the ticket
   * created at the moment of the claim (older claims weren't stamped).
   */
  private pickSeatTicket<T extends { attendeeEmail: string | null; createdAt: Date }>(
    tickets: T[],
    myEmails: Set<string>,
    claimedAt: Date | null,
  ): T | undefined {
    return (
      tickets.find((t) => t.attendeeEmail && myEmails.has(t.attendeeEmail.trim().toLowerCase())) ??
      (claimedAt
        ? [...tickets].sort((a, b) => Math.abs(+a.createdAt - +claimedAt) - Math.abs(+b.createdAt - +claimedAt))[0]
        : undefined)
    );
  }

  /**
   * The check-in records for one of the caller's own registrations — one entry
   * per check-in point the attendee passed through, each with the point name,
   * the time, and the staff member (by name) who recorded it. Newest first.
   */
  async getMyRegistrationCheckins(userId: string, registrationId: string) {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: { userId: true },
    });
    if (!registration) {
      throw new NotFoundException('Registration not found');
    }
    if (registration.userId !== userId) {
      throw new BadRequestException('Unauthorized');
    }

    const records = await this.prisma.eventCheckinRecord.findMany({
      where: { registrationId },
      orderBy: { checkedInAt: 'desc' },
      select: {
        id: true,
        checkedInAt: true,
        checkinType: { select: { id: true, name: true } },
        checkedInByUser: { select: { fullName: true, username: true } },
      },
    });

    return records.map((r) => ({
      id: r.id,
      checkedInAt: r.checkedInAt,
      checkinType: r.checkinType?.name ?? null,
      checkedBy: r.checkedInByUser?.fullName || r.checkedInByUser?.username || null,
    }));
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
    if (reg.userId !== userId) throw new BadRequestException('Unauthorized');

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
        filledMembers,
        reg.event,
        reg.qrCode,
        reg.tickets[0]?.ticketCode,
        null, // don't skip anyone — these are all newly added
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

  // ===========================================================================
  // Manual & bulk attendee management
  //
  // Authorization is enforced at the controller by @Can(EVENT_MANAGE_ATTENDEES);
  // these methods trust that gate and only validate the event/ticket exist.
  // Attendees are keyed by EMAIL: an imported/added row resolves to an existing
  // account via its email identity, or a claimable placeholder account is minted
  // (the same shape auth uses for email sign-ups) so the person auto-claims it on
  // their first real login.
  // ===========================================================================

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
    const idRows = emails.length === 0 ? [] : await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT DISTINCT r.id FROM event_registrations r
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
      select: { registrationId: true, claimedAt: true },
    });
    const seatByReg = new Map(claimedSeats.map((c) => [c.registrationId, c]));

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

    const myEmails = new Set(emails.map((e) => e.trim().toLowerCase()));
    return {
      data: registrations.map((r) => {
        const base = {
          ...r,
          isGroupMember: true,
          leadName: r.user.fullName || r.user.username || null,
        };
        const seat = seatByReg.get(r.id);
        if (!seat) return base;
        // A claimed seat has its own ticket + QR (what check-in scans). Pick it:
        // stamped with my email on newer claims, else the ticket created at the
        // moment of my claim (older claims weren't stamped).
        const mine = this.pickSeatTicket(r.tickets, myEmails, seat.claimedAt);
        return mine ? { ...base, qrCode: mine.qrCode, tickets: [mine] } : base;
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

  // =====================================================
  // NEW PAYMENT METHODS
  // =====================================================

  // RegistrationAttendeesService
  sendGroupInviteBlast(...args: Parameters<RegistrationAttendeesService['sendGroupInviteBlast']>) {
    return this.attendees.sendGroupInviteBlast(...args);
  }

  getRegistrationSources(...args: Parameters<RegistrationAttendeesService['getRegistrationSources']>) {
    return this.attendees.getRegistrationSources(...args);
  }

  getSpaceRegistrationSources(...args: Parameters<RegistrationAttendeesService['getSpaceRegistrationSources']>) {
    return this.attendees.getSpaceRegistrationSources(...args);
  }

  getSourceAttendees(...args: Parameters<RegistrationAttendeesService['getSourceAttendees']>) {
    return this.attendees.getSourceAttendees(...args);
  }

  getAttendeeStats(...args: Parameters<RegistrationAttendeesService['getAttendeeStats']>) {
    return this.attendees.getAttendeeStats(...args);
  }

  getEventRegistrations(...args: Parameters<RegistrationAttendeesService['getEventRegistrations']>) {
    return this.attendees.getEventRegistrations(...args);
  }

  getRegistrationDetail(...args: Parameters<RegistrationAttendeesService['getRegistrationDetail']>) {
    return this.attendees.getRegistrationDetail(...args);
  }

  releaseGroupSeat(...args: Parameters<RegistrationAttendeesService['releaseGroupSeat']>) {
    return this.attendees.releaseGroupSeat(...args);
  }

  reopenGroupSeat(...args: Parameters<RegistrationAttendeesService['reopenGroupSeat']>) {
    return this.attendees.reopenGroupSeat(...args);
  }

  // RegistrationTransfersService
  adminTransferRegistration(...args: Parameters<RegistrationTransfersService['adminTransferRegistration']>) {
    return this.transfers.adminTransferRegistration(...args);
  }

  requestRegistrationTransfer(...args: Parameters<RegistrationTransfersService['requestRegistrationTransfer']>) {
    return this.transfers.requestRegistrationTransfer(...args);
  }

  getMyTransferRequests(...args: Parameters<RegistrationTransfersService['getMyTransferRequests']>) {
    return this.transfers.getMyTransferRequests(...args);
  }

  getAllTransferRequests(...args: Parameters<RegistrationTransfersService['getAllTransferRequests']>) {
    return this.transfers.getAllTransferRequests(...args);
  }

  reviewTransferRequest(...args: Parameters<RegistrationTransfersService['reviewTransferRequest']>) {
    return this.transfers.reviewTransferRequest(...args);
  }

  // RegistrationExportService
  exportRegistrations(...args: Parameters<RegistrationExportService['exportRegistrations']>) {
    return this.exporter.exportRegistrations(...args);
  }

  // RegistrationImportService
  buildImportTemplate(...args: Parameters<RegistrationImportService['buildImportTemplate']>) {
    return this.importer.buildImportTemplate(...args);
  }

  importAttendees(...args: Parameters<RegistrationImportService['importAttendees']>) {
    return this.importer.importAttendees(...args);
  }

  previewImport(...args: Parameters<RegistrationImportService['previewImport']>) {
    return this.importer.previewImport(...args);
  }

  manualAddAttendee(...args: Parameters<RegistrationImportService['manualAddAttendee']>) {
    return this.importer.manualAddAttendee(...args);
  }

  // RegistrationCancellationService
  cancelRegistration(...args: Parameters<RegistrationCancellationService['cancelRegistration']>) {
    return this.cancellation.cancelRegistration(...args);
  }

  cancelMyRegistration(...args: Parameters<RegistrationCancellationService['cancelMyRegistration']>) {
    return this.cancellation.cancelMyRegistration(...args);
  }

  organiserCancelRegistration(...args: Parameters<RegistrationCancellationService['organiserCancelRegistration']>) {
    return this.cancellation.organiserCancelRegistration(...args);
  }

  restoreRegistration(...args: Parameters<RegistrationCancellationService['restoreRegistration']>) {
    return this.cancellation.restoreRegistration(...args);
  }

  // RegistrationPaymentsService
  refundDue(...args: Parameters<RegistrationPaymentsService['refundDue']>) {
    return this.settlement.refundDue(...args);
  }

  verifyPayment(...args: Parameters<RegistrationPaymentsService['verifyPayment']>) {
    return this.settlement.verifyPayment(...args);
  }

  handleRazorpayWebhook(...args: Parameters<RegistrationPaymentsService['handleRazorpayWebhook']>) {
    return this.settlement.handleRazorpayWebhook(...args);
  }

  reconcilePendingPayment(...args: Parameters<RegistrationPaymentsService['reconcilePendingPayment']>) {
    return this.settlement.reconcilePendingPayment(...args);
  }

  adminResolvePending(...args: Parameters<RegistrationPaymentsService['adminResolvePending']>) {
    return this.settlement.adminResolvePending(...args);
  }

  // RegistrationCheckoutService
  registerForEvent(...args: Parameters<RegistrationCheckoutService['registerForEvent']>) {
    return this.checkout.registerForEvent(...args);
  }

  completeRSVP(...args: Parameters<RegistrationCheckoutService['completeRSVP']>) {
    return this.checkout.completeRSVP(...args);
  }

  addToWaitlist(...args: Parameters<RegistrationCheckoutService['addToWaitlist']>) {
    return this.checkout.addToWaitlist(...args);
  }

  createRazorpayOrder(...args: Parameters<RegistrationCheckoutService['createRazorpayOrder']>) {
    return this.checkout.createRazorpayOrder(...args);
  }

  createPaymentOrder(...args: Parameters<RegistrationCheckoutService['createPaymentOrder']>) {
    return this.checkout.createPaymentOrder(...args);
  }

  createWaitlistOfferOrder(...args: Parameters<RegistrationCheckoutService['createWaitlistOfferOrder']>) {
    return this.checkout.createWaitlistOfferOrder(...args);
  }
}

