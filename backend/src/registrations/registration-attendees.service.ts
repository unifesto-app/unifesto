import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { Prisma, GroupSeatStatus } from '@prisma/client';
import { Action, AuthorizationService } from '../auth/authorization';
import { GroupSeatsService } from './group-seats.service';
import { COUNTS_AS_ATTENDING } from '../common/attendance';
import { resolveRegistrationWhatsAppInvite } from '../common/whatsapp-links';
import { seatsFor } from './registration.util';
import { RegistrationConfirmationsService } from './registration-confirmations.service';

/**
 * Organiser-side attendee views: lists, detail, stats, registration sources,
 * group seat release/reopen and the WhatsApp group invite blast.
 */
@Injectable()
export class RegistrationAttendeesService {
  // Same log context as before the split, so log searches keep working.
  private readonly logger = new Logger('RegistrationsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsAppService,
    private readonly groupSeats: GroupSeatsService,
    private readonly authz: AuthorizationService,
    private readonly confirmations: RegistrationConfirmationsService,
  ) {}

  async sendGroupInviteBlast(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        whatsappAttendeeGroupUrl: true,
        parentEvent: { select: { whatsappAttendeeGroupUrl: true } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');

    // The invite link is now per registration (a ticket type may carry its own
    // group). Refuse only when there is no link anywhere — event-level or on any
    // ticket type — so the curator gets a clear "set one first".
    const eventHasLink = !!(
      event.whatsappAttendeeGroupUrl ||
      event.parentEvent?.whatsappAttendeeGroupUrl
    );
    const ticketGroupCount = await this.prisma.eventTicketType.count({
      where: { eventId, whatsappGroupUrl: { not: null } },
    });
    if (!eventHasLink && ticketGroupCount === 0) {
      throw new BadRequestException(
        'No WhatsApp attendee group is set for this event or its ticket types. Add one on the event WhatsApp page first.',
      );
    }

    // Materialise seats for any seatless group first (idempotent; none are
    // expected after the backfills) so every member seat is reachable.
    const groupRegs = await this.prisma.eventRegistration.findMany({
      where: { eventId, ...COUNTS_AS_ATTENDING, groupSize: { gt: 1 } },
      select: { id: true },
    });
    for (const g of groupRegs) {
      await this.groupSeats.ensureSeatsForRegistration(g.id);
    }

    // Confirmed attendees only (same predicate as every headcount). We can't
    // pre-filter on the invite flags because a group whose lead is already
    // invited may still have un-invited member seats — the per-recipient
    // decision happens below.
    const registrations = await this.prisma.eventRegistration.findMany({
      where: { eventId, ...COUNTS_AS_ATTENDING },
      select: {
        id: true,
        whatsappInviteSentAt: true,
        whatsappGroupJoinedAt: true,
        ticketType: { select: { whatsappGroupUrl: true } },
        user: {
          select: { mobileNumber: true, fullName: true, username: true },
        },
        groupSeats: {
          select: {
            id: true,
            seatIndex: true,
            whatsappInviteSentAt: true,
            whatsappJoinedAt: true,
            memberDetails: true,
            claimedBy: {
              select: { mobileNumber: true, fullName: true, username: true },
            },
          },
        },
      },
    });

    // Counts are per *recipient* (person), not per registration — a group is
    // many recipients. "eligible" = recipients we actually attempted.
    let eligible = 0;
    let sent = 0;
    let noPhone = 0;
    let noLink = 0;
    let failed = 0;

    for (const reg of registrations) {
      const { inviteUrl, isCommunity } = resolveRegistrationWhatsAppInvite({
        ticketTypeGroupUrl: reg.ticketType?.whatsappGroupUrl,
        eventAttendeeGroupUrl: event.whatsappAttendeeGroupUrl,
        parentAttendeeGroupUrl: event.parentEvent?.whatsappAttendeeGroupUrl,
      });

      // Lead (individual attendee, or seat 1 of a group): tracked on the row.
      if (!reg.whatsappInviteSentAt && !reg.whatsappGroupJoinedAt) {
        eligible++;
        if (!inviteUrl) {
          noLink++;
        } else if (!reg.user?.mobileNumber) {
          noPhone++;
        } else {
          try {
            const accepted = await this.whatsappService.sendEventWhatsAppGroupInvite(
              reg.user.mobileNumber,
              {
                userName: reg.user.fullName || reg.user.username || 'there',
                eventTitle: event.title,
                inviteUrl,
                isCommunity,
              },
            );
            if (!accepted) throw new Error('WhatsApp did not accept the invite');
            await this.prisma.eventRegistration.update({
              where: { id: reg.id },
              data: { whatsappInviteSentAt: new Date() },
            });
            sent++;
          } catch (error) {
            failed++;
            this.logger.error(
              `Failed to send WhatsApp group invite to registration ${reg.id}`,
              error,
            );
          }
        }
      }

      // Group members (seats 2..N): tracked per seat.
      const memberSeats = reg.groupSeats.filter(
        (s) => s.seatIndex !== 1 && !s.whatsappInviteSentAt && !s.whatsappJoinedAt,
      );
      eligible += memberSeats.length;
      const memberResult = await this.confirmations.sendInviteToGroupMemberSeats(memberSeats, {
        inviteUrl,
        isCommunity,
        eventTitle: event.title,
      });
      sent += memberResult.sent;
      noPhone += memberResult.noPhone;
      noLink += memberResult.noLink;
      failed += memberResult.failed;
    }

    return { eligible, sent, noPhone, noLink, failed };
  }

  /**
   * How many *people* are coming, split by how they booked.
   *
   * "Registrations" is a misleading headline once an event has group tickets:
   * one row can be twenty people, so the registration count and the number of
   * humans in the room are different numbers. This returns both, separately.
   *
   *   individual.attendees  seats booked one person at a time
   *   group.attendees       seats inside group bookings
   *   group.groups          how many group bookings that is
   *
   * `attendees` totals the two, and equals `event.registeredCount`.
   *
   * A booking counts when it is confirmed (PAID or partially refunded), not
   * cancelled and not waitlisted — the same predicate the seat counters and
   * `reconcileSeatCounts` use, so this can never disagree with them.
   */
  /**
   * Where this event's attendees came from: confirmed registrations grouped by
   * the utm_* tags of the link that brought them in. Untagged rows roll up as
   * source `null` (shown as "Direct"). Authorisation is the route's @Can guard.
   */
  async getRegistrationSources(eventId: string) {
    const groups = await this.prisma.eventRegistration.groupBy({
      by: ['utmSource', 'utmMedium', 'utmCampaign'],
      where: { eventId, ...COUNTS_AS_ATTENDING },
      _count: { _all: true },
      _sum: { totalAmount: true },
    });
    const sources = groups
      .map((g) => ({
        source: g.utmSource,
        medium: g.utmMedium,
        campaign: g.utmCampaign,
        registrations: g._count._all,
        revenue: Number(g._sum.totalAmount ?? 0),
      }))
      .sort((a, b) => b.registrations - a.registrations);
    const total = sources.reduce((n, s) => n + s.registrations, 0);
    const tagged = sources
      .filter((s) => s.source)
      .reduce((n, s) => n + s.registrations, 0);
    return { total, tagged, sources };
  }

  /**
   * Space-wide attribution: confirmed registrations across every live event in
   * the space, grouped by utm source/medium/campaign, each with its per-event
   * split. Counts only (no revenue) — money stays behind event/space finance.
   */
  async getSpaceRegistrationSources(spaceId: string) {
    const groups = await this.prisma.eventRegistration.groupBy({
      by: ['utmSource', 'utmMedium', 'utmCampaign', 'eventId'],
      where: { event: { spaceId, deletedAt: null }, ...COUNTS_AS_ATTENDING },
      _count: { _all: true },
    });
    const events = await this.prisma.event.findMany({
      where: { id: { in: [...new Set(groups.map((g) => g.eventId))] } },
      select: { id: true, title: true },
    });
    const titles = new Map(events.map((e) => [e.id, e.title]));

    const buckets = new Map<
      string,
      {
        source: string | null;
        medium: string | null;
        campaign: string | null;
        registrations: number;
        events: { id: string; title: string; registrations: number }[];
      }
    >();
    for (const g of groups) {
      const key = `${g.utmSource}|${g.utmMedium}|${g.utmCampaign}`;
      const b =
        buckets.get(key) ??
        buckets
          .set(key, {
            source: g.utmSource,
            medium: g.utmMedium,
            campaign: g.utmCampaign,
            registrations: 0,
            events: [],
          })
          .get(key)!;
      b.registrations += g._count._all;
      b.events.push({
        id: g.eventId,
        title: titles.get(g.eventId) ?? 'Event',
        registrations: g._count._all,
      });
    }
    const sources = [...buckets.values()]
      .map((b) => ({ ...b, events: b.events.sort((x, y) => y.registrations - x.registrations) }))
      .sort((a, b) => b.registrations - a.registrations);
    const total = sources.reduce((n, s) => n + s.registrations, 0);
    const tagged = sources.filter((s) => s.source).reduce((n, s) => n + s.registrations, 0);
    return { total, tagged, sources };
  }

  /**
   * The confirmed registrations behind one source row of an event's
   * breakdown. An empty string for a tag means "untagged" (null), so the
   * Direct row can be drilled into too.
   */
  async getSourceAttendees(
    eventId: string,
    tags: { source?: string; medium?: string; campaign?: string },
  ) {
    const tag = (v?: string) => (v ? v.toLowerCase() : null);
    const rows = await this.prisma.eventRegistration.findMany({
      where: {
        eventId,
        utmSource: tag(tags.source),
        utmMedium: tag(tags.medium),
        utmCampaign: tag(tags.campaign),
        ...COUNTS_AS_ATTENDING,
      },
      orderBy: { registeredAt: 'desc' },
      take: 500,
      select: {
        id: true,
        registeredAt: true,
        groupSize: true,
        quantity: true,
        ticketType: { select: { name: true } },
        user: { select: { id: true, fullName: true, username: true, avatarUrl: true } },
      },
    });
    return rows;
  }

  async getAttendeeStats(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (!(await this.authz.can({ id: userId }, Action.EVENT_MANAGE_ATTENDEES, { eventId: event.id }))) {
      throw new ForbiddenException('Unauthorized');
    }

    const registrations = await this.prisma.eventRegistration.findMany({
      where: { eventId, ...COUNTS_AS_ATTENDING },
      select: {
        id: true,
        quantity: true,
        groupSize: true,
        ticketTypeId: true,
        checkedInAt: true,
        ticketType: { select: { id: true, name: true, kind: true } },
      },
    });

    // People checked in (any point), so the overview can show check-ins in the
    // same unit as the headcount. Distinct members per group booking.
    const memberCheckins = await this.prisma.eventGroupMemberCheckin.groupBy({
      by: ['registrationId', 'memberIndex'],
      where: { registration: { eventId, ...COUNTS_AS_ATTENDING } },
    });
    const membersIn = new Map<string, number>();
    for (const m of memberCheckins) {
      membersIn.set(m.registrationId, (membersIn.get(m.registrationId) ?? 0) + 1);
    }

    // Group seat claim state (fast-registration Part 2): a paid group holds its
    // seats for capacity, but only CLAIMED seats are *attendees*. Aggregate
    // per-registration seat totals + claimed counts in one query so an unclaimed
    // pay-first seat is not counted as a person here.
    const seatAgg = await this.prisma.groupSeat.groupBy({
      by: ['registrationId', 'status'],
      where: { registration: { eventId, ...COUNTS_AS_ATTENDING } },
      _count: { _all: true },
    });
    const seatTotals = new Map<string, number>();
    const seatClaimed = new Map<string, number>();
    for (const g of seatAgg) {
      seatTotals.set(
        g.registrationId,
        (seatTotals.get(g.registrationId) ?? 0) + g._count._all,
      );
      if (g.status === GroupSeatStatus.CLAIMED) {
        seatClaimed.set(
          g.registrationId,
          (seatClaimed.get(g.registrationId) ?? 0) + g._count._all,
        );
      }
    }

    let individualAttendees = 0;
    let individualBookings = 0;
    let groupAttendees = 0;
    let groupCount = 0;
    let checkedIn = 0;

    // Per-ticket-type rollup, so an organiser with several ticket types can see
    // where the numbers come from rather than just a single total.
    const byTicket = new Map<
      string,
      { ticketTypeId: string | null; name: string; kind: string; attendees: number; bookings: number }
    >();

    for (const r of registrations) {
      // `groupSize` is what makes a booking a group, not the ticket's kind: a
      // GROUP ticket booked for one person still has groupSize set, and a row
      // with no groupSize is one person however it was sold.
      const isGroup = (r.groupSize ?? 0) > 0;
      // Attendee headcount is CLAIMED seats when the group has seat rows; groups
      // without seats (un-backfilled legacy) fall back to the whole group size.
      const attending = seatTotals.has(r.id)
        ? seatClaimed.get(r.id) ?? 0
        : seatsFor(r);

      if (r.checkedInAt) {
        // A group scanned as a whole has no member rows: count everyone in it.
        const members = membersIn.get(r.id);
        checkedIn += isGroup && members ? Math.min(members, attending) : attending;
      }

      if (isGroup) {
        groupAttendees += attending;
        groupCount += 1;
      } else {
        individualAttendees += attending;
        individualBookings += 1;
      }

      const key = r.ticketTypeId ?? 'none';
      const row = byTicket.get(key) ?? {
        ticketTypeId: r.ticketTypeId,
        name: r.ticketType?.name ?? 'Deleted ticket',
        kind: r.ticketType?.kind ?? 'INDIVIDUAL',
        attendees: 0,
        bookings: 0,
      };
      row.attendees += attending;
      row.bookings += 1;
      byTicket.set(key, row);
    }

    return {
      attendees: individualAttendees + groupAttendees,
      /** People checked in at least once, same unit as `attendees`. */
      checkedIn,
      individual: {
        attendees: individualAttendees,
        bookings: individualBookings,
      },
      group: {
        attendees: groupAttendees,
        groups: groupCount,
      },
      byTicketType: [...byTicket.values()].sort(
        (a, b) => b.attendees - a.attendees,
      ),
    };
  }

  async getEventRegistrations(
    userId: string,
    eventId: string,
    page = 1,
    limit = 50,
    search?: string,
    status?: 'REGISTERED' | 'ATTENDED' | 'CANCELLED',
    paymentStatus?: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED',
    ticketTypeId?: string,
    attendingOnly = false,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (!(await this.authz.can({ id: userId }, Action.EVENT_MANAGE_ATTENDEES, { eventId: event.id }))) {
      throw new ForbiddenException('Unauthorized');
    }

    const skip = (page - 1) * limit;

    // Build where clause with filters
    const where: any = { eventId };

    if (status) {
      where.status = status;
    }

    if (paymentStatus) {
      where.paymentStatus = paymentStatus;
    }

    if (ticketTypeId) {
      where.ticketTypeId = ticketTypeId;
    }

    // The attendees list opts into a "confirmed attendees only" view via
    // `attendingOnly`, so its header count and rows match the "No. of
    // attendees" tile — not cancelled, paid or partially refunded (free
    // registrations are stored as PAID), and not on the waiting list — instead
    // of being padded with cancelled / failed / pending / waitlisted rows that
    // confuse organisers. Callers that need every registration (e.g. the
    // transactions page's financial summary, which must still see refunded /
    // failed / pending rows) simply don't pass it. An explicit status/payment
    // filter always wins, so "Cancelled" or "Failed" stay drillable.
    if (attendingOnly && !status && !paymentStatus) {
      Object.assign(where, COUNTS_AS_ATTENDING);
    }

    if (search && search.trim()) {
      const searchTerm = search.trim();
      const or: Prisma.EventRegistrationWhereInput[] = [
        { user: { fullName: { contains: searchTerm, mode: 'insensitive' } } },
        { user: { username: { contains: searchTerm, mode: 'insensitive' } } },
        { user: { mobileNumber: { contains: searchTerm } } },
        { user: { identities: { some: { email: { contains: searchTerm, mode: 'insensitive' } } } } },
      ];

      // Also match on the details of GROUP / TEAM members — the people on a
      // registration who are not the registering lead (the `user` matched
      // above). Their captured details live in `group_seats.member_details`,
      // JSONB that Prisma cannot substring-search, alongside a seat's invite email and — once a member
      // claims their seat — that member's own account. We resolve the matching
      // registration ids for this event with one raw query (casting each JSONB
      // to text for a case-insensitive ILIKE) and fold them into the same OR, so
      // a hit on any teammate surfaces the lead's row in the list. LIKE
      // metacharacters in the term are escaped so `%`/`_` stay literal.
      const like = `%${searchTerm.replace(/[\\%_]/g, '\\$&')}%`;
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

      where.OR = or;
    }

    const [registrations, total] = await Promise.all([
      this.prisma.eventRegistration.findMany({
        where,
        skip,
        take: limit,
        orderBy: { registeredAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              username: true,
              mobileNumber: true,
              avatarUrl: true,
              identities: {
                select: {
                  email: true,
                },
                take: 1,
              },
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
        },
      }),
      this.prisma.eventRegistration.count({ where }),
    ]);

    // Format the response to include email
    const formattedRegistrations = registrations.map((reg: any) => ({
      ...reg,
      user: {
        ...reg.user,
        email: reg.user.identities?.[0]?.email || null,
        identities: undefined, // Remove the identities array from response
      },
    }));

    return {
      registrations: formattedRegistrations,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Full registration detail for the organiser attendee view.
   * Backed by the attendee detail page. Space Admins only.
   */
  async getRegistrationDetail(
    userId: string,
    eventId: string,
    registrationId: string,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (!(await this.authz.can({ id: userId }, Action.EVENT_MANAGE_ATTENDEES, { eventId: event.id }))) {
      throw new ForbiddenException('Unauthorized');
    }

    return this.buildRegistrationDetail(eventId, registrationId);
  }

  /**
   * Load one registration and shape it for the organiser detail view (flattening
   * the holder's and each seat-claimer's email out of their identities array).
   * NO authorisation — callers must gate access first ({@link getRegistrationDetail}
   * checks Space-Admin standing; the restore path relies on its @Can guard).
   */
  async buildRegistrationDetail(
    eventId: string,
    registrationId: string,
  ) {
    const registration = await this.prisma.eventRegistration.findFirst({
      where: { id: registrationId, eventId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            mobileNumber: true,
            avatarUrl: true,
            identities: { select: { email: true }, take: 1 },
          },
        },
        ticketType: {
          select: { id: true, name: true, price: true, currency: true },
        },
        tickets: true,
        checkinRecords: {
          orderBy: { checkedInAt: 'asc' },
          include: {
            checkinType: { select: { id: true, name: true } },
            checkedInByUser: {
              select: { id: true, fullName: true, username: true },
            },
          },
        },
        // Per-seat status for group registrations (fast-registration Part 2), so
        // the organiser sees which seats are OPEN / INVITED / CLAIMED. The invite
        // token is deliberately NOT exposed — only the lead can manage invites.
        groupSeats: {
          orderBy: { seatIndex: 'asc' },
          select: {
            seatIndex: true,
            status: true,
            inviteEmail: true,
            memberDetails: true,
            claimedAt: true,
            whatsappInviteSentAt: true,
            claimedBy: {
              select: {
                fullName: true,
                username: true,
                identities: { select: { email: true }, take: 1 },
              },
            },
          },
        },
      },
    });

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    const { identities, ...user } = registration.user as any;
    // Flatten each seat's claimer email out of its identities array.
    const groupSeats = (registration.groupSeats ?? []).map((s: any) => {
      const claimedBy = s.claimedBy
        ? {
            fullName: s.claimedBy.fullName,
            username: s.claimedBy.username,
            email: s.claimedBy.identities?.[0]?.email || null,
          }
        : null;
      return { ...s, claimedBy };
    });
    return {
      ...registration,
      groupSeats,
      user: { ...user, email: identities?.[0]?.email || null },
    };
  }

  /**
   * Curator-side: retire an unfilled group seat. Capability is enforced by the
   * controller's `@Can(EVENT_MANAGE_ATTENDEES)` guard; here we only scope the
   * registration to the event (so a curator of event A can't touch event B's
   * seats) before delegating to the shared, race-safe seat transition.
   */
  async releaseGroupSeat(
    eventId: string,
    registrationId: string,
    seatIndex: number,
  ) {
    await this.assertRegistrationInEvent(eventId, registrationId);
    return this.groupSeats.releaseSeat(registrationId, seatIndex);
  }

  /** Curator-side: bring a retired seat back into play (RELEASED → OPEN). */
  async reopenGroupSeat(
    eventId: string,
    registrationId: string,
    seatIndex: number,
  ) {
    await this.assertRegistrationInEvent(eventId, registrationId);
    return this.groupSeats.reopenSeat(registrationId, seatIndex);
  }

  /** Ensure a registration exists and belongs to this event. */
  private async assertRegistrationInEvent(
    eventId: string,
    registrationId: string,
  ) {
    const reg = await this.prisma.eventRegistration.findFirst({
      where: { id: registrationId, eventId },
      select: { id: true },
    });
    if (!reg) throw new NotFoundException('Registration not found');
  }
}
