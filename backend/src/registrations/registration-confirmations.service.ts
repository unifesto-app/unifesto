import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { RedisService } from '../redis/redis.service';
import { GroupSeatsService } from './group-seats.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationEvents } from '../notifications/notifications.constants';
import type { RegistrationConfirmedEvent } from '../notifications/notifications.events';
import { resolveRegistrationWhatsAppInvite } from '../common/whatsapp-links';
import { seatPhone, seatMemberName, type SeatLike } from './group-invite.util';
import { formatEventDate, formatEventTime, generateQRCode, generateTicketCode } from './registration.util';

/**
 * Confirmation emails / WhatsApp / push for a settled registration, the
 * shared ticket to each group member, and the per-seat WhatsApp group invite.
 */
@Injectable()
export class RegistrationConfirmationsService {
  // Same log context as before the split, so log searches keep working.
  private readonly logger = new Logger('RegistrationsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly whatsappService: WhatsAppService,
    private readonly events: EventEmitter2,
    private readonly groupSeats: GroupSeatsService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Sends WhatsApp + email registration confirmations for a completed (PAID) registration.
   * Shared by RSVP completion and free-ticket completion in createPaymentOrder.
   */
  async sendRegistrationConfirmations(registrationId: string) {
    // One confirmation per registration, no matter how many code paths reach
    // here. The webhook (`payment.captured`), the client-side verify, and
    // Razorpay's own webhook retries all race to confirm the same payment —
    // each guards on `paymentStatus === PAID` only *before* acting, so two that
    // overlap across replicas both send. This atomic setNx (7-day TTL, keyed by
    // registration) is the authoritative "send exactly once" gate for all of
    // them. fail-open on a Redis outage: a rare duplicate beats a silently
    // missing confirmation.
    const first = await this.redis.setNx(
      `reg:confirmation:${registrationId}`,
      '1',
      7 * 24 * 60 * 60,
    );
    if (!first) {
      this.logger.log(
        `Confirmation already sent for registration ${registrationId} — skipping duplicate`,
      );
      return;
    }

    const fullRegistration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: {
        user: true,
        // The attendee's ticket type may carry its own WhatsApp group link,
        // which takes precedence over the event's.
        ticketType: { select: { whatsappGroupUrl: true } },
        // The holder's own ticket (member seat tickets carry an attendeeEmail).
        tickets: { where: { attendeeEmail: null }, take: 1, select: { ticketCode: true } },
        // Group member seats, so upfront-filled members are invited alongside the
        // lead at registration time (late claimers get theirs on claim / blast).
        groupSeats: {
          select: {
            id: true,
            seatIndex: true,
            whatsappInviteSentAt: true,
            memberDetails: true,
            claimedBy: {
              select: { mobileNumber: true, fullName: true, username: true },
            },
          },
        },
        // Pull the parent's attendee group too, so a sub-event attendee who has
        // no group link of their own still gets routed into the big event's
        // WhatsApp group.
        event: {
          include: {
            parentEvent: {
              select: { whatsappAttendeeGroupUrl: true },
            },
            // Organiser name for the calendar (.ics) ORGANIZER line. Branding
            // and sender are resolved by EmailService from the eventId.
            space: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (!fullRegistration) return;

    // Send WhatsApp notification
    try {
      if (fullRegistration.user?.mobileNumber) {
        const eventDate = formatEventDate(fullRegistration.event.startDateTime);
        const eventTime = formatEventTime(
          fullRegistration.event.startDateTime,
          fullRegistration.event.endDateTime,
        );

        await this.whatsappService.sendRegistrationConfirmation(
          fullRegistration.user.mobileNumber,
          {
            userName: fullRegistration.user.fullName || fullRegistration.user.username || 'there',
            eventTitle: fullRegistration.event.title,
            eventDate,
            eventTime,
            venueName: fullRegistration.event.venueName || undefined,
            city: fullRegistration.event.city || undefined,
            isOnline: fullRegistration.event.type === 'ONLINE',
            onlineUrl: fullRegistration.event.onlineUrl || undefined,
          },
        );
      }
    } catch (error) {
      this.logger.error('Failed to send WhatsApp notification', error);
    }

    // WhatsApp attendee-group invite (Option A + C). Push the organiser's
    // PRIVATE attendee invite group to the attendee so joining is one tap in the
    // chat they already have open. Precedence: the ticket type's own group link,
    // else the event's attendee group, else — for a sub-event — the parent big
    // event's attendee group. Never the legacy public links. Non-blocking,
    // fail-soft.
    try {
      if (fullRegistration.user?.mobileNumber) {
        const ev = fullRegistration.event;
        const { inviteUrl, isCommunity } = resolveRegistrationWhatsAppInvite({
          ticketTypeGroupUrl: fullRegistration.ticketType?.whatsappGroupUrl,
          eventAttendeeGroupUrl: ev.whatsappAttendeeGroupUrl,
          parentAttendeeGroupUrl: ev.parentEvent?.whatsappAttendeeGroupUrl,
        });

        if (inviteUrl) {
          const accepted = await this.whatsappService.sendEventWhatsAppGroupInvite(
            fullRegistration.user.mobileNumber,
            {
              userName:
                fullRegistration.user.fullName ||
                fullRegistration.user.username ||
                'there',
              eventTitle: ev.title,
              inviteUrl,
              isCommunity,
            },
          );
          // Record that this attendee was invited, so a curator's later manual
          // blast skips them (send-once dedup). Only when Meta took it: a
          // rejected send stays eligible for the blast.
          if (accepted) {
            await this.prisma.eventRegistration.update({
              where: { id: fullRegistration.id },
              data: { whatsappInviteSentAt: new Date() },
            });
          }
        }

        // Invite any group members already on the roster at registration time
        // (seats 2..N). Late claimers are invited when they claim / on a blast.
        if (fullRegistration.groupSeats?.length) {
          await this.sendInviteToGroupMemberSeats(fullRegistration.groupSeats, {
            inviteUrl,
            isCommunity,
            eventTitle: ev.title,
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to send WhatsApp group invite', error);
    }

    // Send email notification (non-blocking). Primary email, else any: a
    // phone-first account's email often sits on a non-primary identity.
    const email = await this.groupSeats.primaryEmail(fullRegistration.userId, null);

    if (email) {
      const eventDate = formatEventDate(fullRegistration.event.startDateTime);
      const eventTime = formatEventTime(
        fullRegistration.event.startDateTime,
        fullRegistration.event.endDateTime,
      );

      this.emailService
        .sendRegistrationConfirmation({
          email,
          userName: fullRegistration.user.fullName || fullRegistration.user.username || 'there',
          eventId: fullRegistration.event.id,
          eventTitle: fullRegistration.event.title,
          eventDate,
          eventTime,
          venueName: fullRegistration.event.venueName || undefined,
          city: fullRegistration.event.city || undefined,
          isOnline: fullRegistration.event.type === 'ONLINE',
          onlineUrl: fullRegistration.event.onlineUrl || undefined,
          qrCode: fullRegistration.qrCode,
          ticketCode: fullRegistration.tickets[0]?.ticketCode || undefined,
          // Raw fields for the "Add to calendar" .ics attachment.
          eventSlug: fullRegistration.event.slug,
          eventStartDateTime: fullRegistration.event.startDateTime,
          eventEndDateTime: fullRegistration.event.endDateTime,
          eventTimezone: fullRegistration.event.timezone,
          eventType: fullRegistration.event.type,
          venueAddress: fullRegistration.event.venueAddress || undefined,
          eventDescription: fullRegistration.event.description || undefined,
          organiserName: fullRegistration.event.space?.name || undefined,
        })
        .catch((err) => this.logger.error('Failed to send registration confirmation email', err));
    }

    await this.sendGroupMemberConfirmations(
      fullRegistration.id,
      fullRegistration.event,
      fullRegistration.qrCode,
      undefined,
      email,
    );

    // Offline push confirmation (best-effort, decoupled via the event bus).
    this.events.emit(NotificationEvents.RegistrationConfirmed, {
      userId: fullRegistration.userId,
      eventId: fullRegistration.event.id,
      eventTitle: fullRegistration.event.title,
      eventSlug: fullRegistration.event.slug,
    } satisfies RegistrationConfirmedEvent);
  }

  /**
   * Email each group member their ticket, not just the lead. A member gets a
   * seat ticket of their own (stamped with their email, so removing them
   * deletes it), never the group's shared QR (A28). Seat 1 is the lead: only
   * when they weren't mailed already (`leadEmail` null) do they get the
   * group's own ticket here. Duplicate emails are skipped. Non-blocking: a
   * failed send never breaks the flow.
   */
  async sendGroupMemberConfirmations(
    registrationId: string,
    event: any,
    // The group's own ticket, for the lead's entry.
    qrCode: string,
    ticketCode: string | undefined,
    leadEmail: string | null,
    // Just these members (a roster edit's new ones); default: the whole roster
    // from its GroupSeat rows (S42), seat 1 first.
    only?: Array<{ name?: string | null; email?: string | null; mobile?: string | null }>,
  ): Promise<void> {
    const members: Array<{ name?: string | null; email?: string | null; mobile?: string | null }> =
      only ?? ((await this.groupSeats.getRoster(registrationId)) ?? []);
    this.logger.log(
      `[group-email] ${members.length} member(s), lead=${leadEmail ?? 'none'}`,
    );
    if (members.length === 0) return;

    const eventDate = formatEventDate(event.startDateTime);
    const eventTime = formatEventTime(event.startDateTime, event.endDateTime);
    const lead = (leadEmail ?? '').trim().toLowerCase();
    const seen = new Set<string>();

    for (const [i, m] of members.entries()) {
      const email = (m?.email ?? '').trim();
      if (!email) {
        this.logger.warn(`[group-email] skip member "${m?.name}": no email`);
        continue;
      }
      const key = email.toLowerCase();
      if (key === lead || seen.has(key)) {
        this.logger.log(`[group-email] skip ${email} (lead or duplicate)`);
        continue; // skip the lead + duplicates
      }
      seen.add(key);
      const ticket =
        !only && i === 0
          ? { qrCode, ticketCode }
          : await this.memberTicket(registrationId, key, m.name).catch((err) => {
              this.logger.error(`[group-email] no ticket for ${email}`, err);
              return null;
            });
      if (!ticket) continue;
      this.logger.log(`[group-email] sending ticket to ${email}`);
      this.emailService
        .sendRegistrationConfirmation({
          email,
          userName: m.name || 'there',
          eventId: event.id,
          eventTitle: event.title,
          eventDate,
          eventTime,
          venueName: event.venueName || undefined,
          city: event.city || undefined,
          isOnline: event.type === 'ONLINE',
          onlineUrl: event.onlineUrl || undefined,
          qrCode: ticket.qrCode,
          ticketCode: ticket.ticketCode ?? undefined,
          // Raw fields for the "Add to calendar" .ics attachment. organiserName
          // is optional — it's present only when the caller's event include
          // loaded `space`; the .ics is still valid without ORGANIZER.
          eventSlug: event.slug,
          eventStartDateTime: event.startDateTime,
          eventEndDateTime: event.endDateTime,
          eventTimezone: event.timezone,
          eventType: event.type,
          venueAddress: event.venueAddress || undefined,
          eventDescription: event.description || undefined,
          organiserName: event.space?.name || undefined,
        })
        .catch((err) =>
          this.logger.error('Failed to send group member ticket email', err),
        );

      // WhatsApp confirmation to the member's captured mobile (10-digit is
      // fine — the service prepends +91). Non-blocking, like the email.
      const mobile = (m?.mobile ?? '').trim();
      if (mobile) {
        this.logger.log(`[group-email] sending WhatsApp to ${mobile}`);
        this.whatsappService
          .sendRegistrationConfirmation(mobile, {
            userName: m.name || 'there',
            eventTitle: event.title,
            eventDate,
            eventTime,
            venueName: event.venueName || undefined,
            city: event.city || undefined,
            isOnline: event.type === 'ONLINE',
            onlineUrl: event.onlineUrl || undefined,
          })
          .catch((err) =>
            this.logger.error('Failed to send group member WhatsApp', err),
          );
      }
    }
  }

  /** A typed-in member's own seat ticket, stamped with their email: found, or made once. */
  private async memberTicket(registrationId: string, email: string, name?: string | null) {
    const select = { qrCode: true, ticketCode: true } as const;
    const found = await this.prisma.eventTicket.findFirst({
      where: { registrationId, attendeeEmail: { equals: email, mode: 'insensitive' } },
      select,
    });
    return (
      found ??
      this.prisma.eventTicket.create({
        data: {
          registrationId,
          ticketCode: generateTicketCode(),
          qrCode: generateQRCode(),
          attendeeName: name?.trim() || null,
          attendeeEmail: email,
        },
        select,
      })
    );
  }

  /**
   * Curator / Co-Curator / Space Admin blast: push the event's WhatsApp
   * group/community invite to every confirmed attendee who has a mobile number
   * and hasn't already been invited or self-marked as joined.
   *
   * "Joined" isn't observable via WhatsApp's API, so the two suppressors are
   * `whatsappInviteSentAt` (send-once) and the attendee's `whatsappGroupJoinedAt`
   * self-mark. Delivery is fail-soft per recipient; one bad number never aborts
   * the run. Returns a per-outcome tally for the curator's toast.
   */
  /**
   * Send the WhatsApp group invite to each un-invited group *member* seat (the
   * lead is seat 1 and is handled via the registration row, so it's skipped
   * here). Send-once per seat via `whatsappInviteSentAt`. Fail-soft per seat.
   * Returns a per-seat tally so the blast can aggregate; the auto-push ignores it.
   */
  async sendInviteToGroupMemberSeats(
    seats: Array<
      SeatLike & { id: string; seatIndex: number; whatsappInviteSentAt: Date | null }
    >,
    ctx: { inviteUrl: string | null; isCommunity: boolean; eventTitle: string },
  ): Promise<{ sent: number; noPhone: number; noLink: number; failed: number }> {
    let sent = 0;
    let noPhone = 0;
    let noLink = 0;
    let failed = 0;

    for (const seat of seats) {
      // Seat 1 is the lead — invited via the registration row, not here.
      if (seat.seatIndex === 1) continue;
      if (seat.whatsappInviteSentAt) continue;

      if (!ctx.inviteUrl) {
        noLink++;
        continue;
      }
      const mobile = seatPhone(seat);
      if (!mobile) {
        noPhone++;
        continue;
      }
      try {
        const accepted = await this.whatsappService.sendEventWhatsAppGroupInvite(mobile, {
          userName: seatMemberName(seat),
          eventTitle: ctx.eventTitle,
          inviteUrl: ctx.inviteUrl,
          isCommunity: ctx.isCommunity,
        });
        if (!accepted) {
          failed++;
          continue;
        }
        await this.prisma.groupSeat.update({
          where: { id: seat.id },
          data: { whatsappInviteSentAt: new Date() },
        });
        sent++;
      } catch (error) {
        failed++;
        this.logger.error(
          `Failed to send WhatsApp group invite to seat ${seat.id}`,
          error,
        );
      }
    }
    return { sent, noPhone, noLink, failed };
  }
}
