import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { enforceFormAnswers } from './form-answers.policy';
import { editWindow } from './attendee-details.service';
import { checkAnswers, formatAnswer, type FormFieldLike } from './form-answers.util';
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
import { CouponsService, type ResolvedDiscount } from '../coupons/coupons.service';
import { buildExportFile, type ExportFormat } from './export.util';
import {
  buildTemplateSpec,
  parseCsv,
  parseImportRows,
  type ImportTicketShape,
  type ParsedImportRow,
} from './manual-import.util';
import {
  EventRegistration,
  EventStatus,
  PaymentStatus,
  RegistrationStatus,
  Prisma,
  TicketStatus,
  WaitlistStatus,
  GroupSeatStatus,
  Provider,
  CouponRedemptionStatus,
  BillingModel,
  OrgPlan,
  EventVisibility,
  FormFieldType,
} from '@prisma/client';
import { assertEventSpaceAdmin, canAccessSpaceOnlyEvent, isSpaceAdmin } from '../events/event-access';
import {
  RegisterForEventDto,
  VerifyRegistrationDto,
  CreateOrderDto,
  VerifyPaymentDto,
  OrderResponseDto,
  RegistrationResponseDto,
  GroupMemberDto,
  WaitlistJoinResponseDto,
  AdminResolvePendingDto,
} from './dto';
import { WaitlistService } from './waitlist.service';
import { GroupSeatsService } from './group-seats.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationEvents } from '../notifications/notifications.constants';
import type { RegistrationConfirmedEvent, RegistrationUpdateEvent } from '../notifications/notifications.events';
import { NOT_DELETED } from '../common/soft-delete';
import { utmColumns } from '../common/utm';
import { COUNTS_AS_ATTENDING } from '../common/attendance';
import { resolveRegistrationWhatsAppInvite } from '../common/whatsapp-links';
import { seatPhone, seatMemberName, type SeatLike } from './group-invite.util';
import * as crypto from 'crypto';

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
  ) {}

  private generateQRCode(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Enforce organiser-configured ticket restrictions. A user who already holds a
   * paid ticket that blocks `targetTicketTypeId` cannot register for it. The
   * relationship is directional: only ticket types listed as blockers of the
   * target are considered (owning the blocked ticket does not prevent buying the
   * blocker).
   */
  private async assertTicketNotBlocked(
    userId: string,
    eventId: string,
    targetTicketTypeId: string,
  ) {
    const blockers = await this.prisma.ticketTypeBlock.findMany({
      where: { blockedId: targetTicketTypeId },
      select: { blockerId: true },
    });
    if (blockers.length === 0) return;

    const conflicting = await this.prisma.eventRegistration.findFirst({
      where: {
        eventId,
        userId,
        paymentStatus: PaymentStatus.PAID,
        status: { not: RegistrationStatus.CANCELLED },
        ticketTypeId: { in: blockers.map((b) => b.blockerId) },
      },
      include: { ticketType: { select: { name: true } } },
    });
    if (conflicting) {
      throw new BadRequestException(
        `This ticket isn't available because you're already registered for “${
          conflicting.ticketType?.name ?? 'another ticket'
        }”.`,
      );
    }
  }

  private generateTicketCode(): string {
    return crypto
      .randomBytes(4)
      .toString('hex')
      .toUpperCase();
  }

  /**
   * For GROUP tickets, validate the roster the lead chose to fill in up-front.
   *
   * A PARTIAL roster is allowed: the lead enters details for whoever they can
   * now (at minimum themselves) and leaves the remaining seats OPEN, to invite
   * and claim later (fast-registration Part 2 — see GroupSeatsService). So we
   * require at least one member and reject a roster LARGER than the group (a
   * client bug), but not a short one. Every member that IS provided must still
   * be complete, so each filled seat can be emailed a ticket and identified at
   * check-in. Per-member field validation also lives in GroupMemberDto.
   */
  private assertGroupMembersComplete(
    members: GroupMemberDto[] | undefined,
    groupSize: number,
  ): void {
    if (!members || members.length === 0) {
      throw new BadRequestException(
        'Group registrations must include details for at least the lead member',
      );
    }
    if (members.length > groupSize) {
      throw new BadRequestException(
        `A group of ${groupSize} can have at most ${groupSize} members (received ${members.length})`,
      );
    }
    // Validate each member's content directly — do NOT rely on the DTO's nested
    // @ValidateNested, which silently skips array-shaped members. A buggy older
    // app sent `[[], [], ...]` (empty arrays), which otherwise passes the count
    // check and stores a group with no member details.
    const filled = (v: unknown): boolean =>
      typeof v === 'string' && v.trim().length > 0;
    members.forEach((m, i) => {
      // Non-object / array-shaped members are the old-app bug signature: the
      // user can't fix this by editing the form, only by updating the app.
      if (!m || typeof m !== 'object' || Array.isArray(m)) {
        throw new BadRequestException(
          'Please update the Unifesto app to the latest version to register a group.',
        );
      }
      const { name, email, mobile } = m as {
        name?: unknown;
        email?: unknown;
        mobile?: unknown;
      };
      if (!filled(name) || !filled(email) || !filled(mobile)) {
        throw new BadRequestException(
          `Missing details for group member ${i + 1}. Each member needs a name, email and mobile number.`,
        );
      }
    });
  }

  /**
   * Seats a registration occupies: the group size for GROUP tickets, else the
   * quantity. Capacity and the soldCount/registeredCount counters use this so a
   * group of N takes up N seats — even though the group still shares one ticket.
   */
  private seatsFor(r: { groupSize?: number | null; quantity: number }): number {
    return r.groupSize ?? r.quantity;
  }

  /**
   * Guard a ticket's optional on-sale window at purchase time.
   *
   * Either bound may be null (open-ended). This runs before the capacity /
   * waitlist branch, so a ticket outside its window is rejected outright rather
   * than dropping the buyer onto a waiting list — a scheduled drop that hasn't
   * opened, or a sale that has closed, is simply not for sale right now.
   */
  private assertTicketOnSale(ticketType: {
    saleStartsAt?: Date | null;
    saleEndsAt?: Date | null;
  }): void {
    const now = new Date();
    if (ticketType.saleStartsAt && now < ticketType.saleStartsAt) {
      throw new BadRequestException(
        `This ticket goes on sale on ${ticketType.saleStartsAt.toLocaleString(
          'en-IN',
          { timeZone: 'Asia/Kolkata' },
        )}.`,
      );
    }
    if (ticketType.saleEndsAt && now > ticketType.saleEndsAt) {
      throw new BadRequestException('Sales for this ticket have ended.');
    }
  }

  /**
   * Format event date for display
   * Output: "1 July 2026"
   */
  private formatEventDate(dateTime: Date, timezone = 'Asia/Kolkata'): string {
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
  private formatEventTime(startTime: Date, endTime: Date, timezone = 'Asia/Kolkata'): string {
    const formatTime = (date: Date) =>
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: timezone,
      }).format(date);

    return `${formatTime(startTime)} - ${formatTime(endTime)} IST`;
  }

  /** Space-only events accept registrations from hosting-space members only. */
  private async assertMayRegister(
    event: {
      id: string;
      spaceId: string;
      visibility: EventVisibility;
      space?: { name: string } | null;
    },
    userId: string,
  ) {
    if (!(await canAccessSpaceOnlyEvent(this.prisma, event, userId))) {
      throw new ForbiddenException(
        `This event is only open to members of ${event.space?.name ?? 'its space'}. Join the space to register.`,
      );
    }
  }

  async registerForEvent(userId: string, eventId: string, dto: RegisterForEventDto) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        space: {
          include: { subscription: true },
        },
        ticketTypes: true,
        registrations: {
          where: { userId },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }
    await this.assertMayRegister(event, userId);

    // Every registration must target a specific ticket type or RSVP option.
    // This blocks the legacy "hidden" RSVP (ticketTypeId = null) that belonged
    // to no listed type and therefore never surfaced under RSVPs or Attendees.
    // Organisers must add at least one RSVP/ticket type before an event can
    // accept registrations.
    if (!dto.ticketTypeId) {
      throw new BadRequestException(
        'Please select a ticket type or RSVP option to register for this event.',
      );
    }

    // Organiser-configured restriction: reject if the user already holds a
    // ticket that blocks the requested one.
    await this.assertTicketNotBlocked(userId, eventId, dto.ticketTypeId);

    // Answer policy: typed, within limits, required where visible (the lead's
    // own answers now; other members answer when they claim their seat).
    const formTicket = event.ticketTypes.find((t) => t.id === dto.ticketTypeId);
    dto.formResponses = await enforceFormAnswers(this.prisma, {
      eventId,
      ticketTypeId: dto.ticketTypeId,
      isGroup: formTicket?.kind === 'GROUP',
      formResponses: dto.formResponses,
      members: dto.groupMembers,
      required: { team: true, members: 'first' },
      uploaderIds: [userId],
    });

    // A user can hold at most one registration per distinct ticket type on an
    // event. Once they hold a given type, that type is no longer available to
    // them (enforced here and reflected in the registration UI).
    const requestedTicketTypeId = dto.ticketTypeId;

    const paidRegistration = event.registrations.find(
      (r) =>
        r.paymentStatus === PaymentStatus.PAID &&
        r.status !== RegistrationStatus.CANCELLED &&
        (r.ticketTypeId || null) === requestedTicketTypeId,
    );
    if (paidRegistration) {
      throw new BadRequestException('You already have a ticket of this type for this event');
    }

    // Clear an existing PENDING (unpaid) registration for the same ticket type
    // instead of leaving a duplicate behind. A cancelled row is skipped so a
    // superseded checkout (below) is never re-matched.
    const pendingRegistration = event.registrations.find(
      (r) =>
        r.paymentStatus === PaymentStatus.PENDING &&
        r.status !== RegistrationStatus.CANCELLED &&
        (r.ticketTypeId || null) === requestedTicketTypeId,
    );
    if (pendingRegistration) {
      if (pendingRegistration.orderId) {
        // This pending row already reached checkout: a Razorpay order exists,
        // its id is embedded in that order's `notes`, and the attendee may yet
        // complete that earlier checkout. Hard-deleting it would orphan any such
        // payment — the webhook looks up a registration that no longer exists
        // and drops the money silently. Keep the row (and its id) so the payment
        // stays recoverable via the webhook or reconcile; just cancel it so it
        // no longer counts as an active duplicate.
        await this.prisma.eventRegistration.update({
          where: { id: pendingRegistration.id },
          data: {
            status: RegistrationStatus.CANCELLED,
            cancelledAt: new Date(),
            cancellationReason: 'Superseded by a new registration attempt',
          },
        });
      } else {
        // Never reached checkout — no order, so no payment can exist against it.
        // Safe to hard-delete.
        await this.prisma.eventRegistration.delete({
          where: { id: pendingRegistration.id },
        });
      }
    }

    if (event.status !== 'PUBLISHED') {
      throw new BadRequestException('Event is not open for registration');
    }

    // A recurring series parent is a non-registerable template — attendees
    // register for its concrete occurrences, never the series itself.
    if (event.isRecurring) {
      throw new BadRequestException(
        'This is a recurring series; register for a specific occurrence instead.',
      );
    }

    const quantity = dto.quantity || 1;

    // Capacity is enforced per ticket type (ticketType.totalQuantity) below —
    // there is no overall event-level cap. A sold-out ticket type falls back to
    // the waitlist when the event has it enabled.
    let ticketType: any = null;
    if (dto.ticketTypeId) {
      ticketType = event.ticketTypes.find((t) => t.id === dto.ticketTypeId);
      if (!ticketType) {
        throw new NotFoundException('Ticket type not found');
      }

      if (!ticketType.isActive || !ticketType.isVisible) {
        throw new BadRequestException('Ticket type not available');
      }

      this.assertTicketOnSale(ticketType);

      // Try to reserve tickets
      const reserved = await this.cache.reserveTickets(
        eventId,
        dto.ticketTypeId,
        userId,
        quantity,
      );

      if (!reserved) {
        // Check actual availability in DB (null totalQuantity = unlimited).
        // A group occupies groupSize seats, not 1.
        const plannedSeats =
          ticketType.kind === 'GROUP'
            ? dto.groupSize ?? ticketType.minGroupSize ?? 1
            : quantity;
        if (
          ticketType.totalQuantity != null &&
          ticketType.soldCount + plannedSeats > ticketType.totalQuantity
        ) {
          // Sold out: fall back to the waiting list when this ticket has one.
          if (ticketType.waitlistEnabled) {
            return this.addToWaitlist(userId, eventId, dto);
          }
          throw new BadRequestException('Not enough tickets available');
        }
      }

      if (quantity > ticketType.perUserLimit) {
        throw new BadRequestException(
          `Maximum ${ticketType.perUserLimit} tickets per user`,
        );
      }
    }

    // Resolve group size (for GROUP tickets) and the base price.
    let groupSize: number | null = null;
    let basePrice = 0;
    if (ticketType) {
      const price = Number(ticketType.price);
      if (ticketType.kind === 'GROUP') {
        const size: number = dto.groupSize ?? ticketType.minGroupSize ?? 1;
        if (
          (ticketType.minGroupSize != null && size < ticketType.minGroupSize) ||
          (ticketType.maxGroupSize != null && size > ticketType.maxGroupSize)
        ) {
          throw new BadRequestException(
            `Group size must be between ${ticketType.minGroupSize} and ${ticketType.maxGroupSize}`,
          );
        }
        groupSize = size;
        this.assertGroupMembersComplete(dto.groupMembers, size);
        basePrice =
          ticketType.groupPricingMode === 'PER_PERSON' ? price * size : price;
      } else {
        basePrice = price * quantity;
      }
    }

    // App-wide processing fee (admin-set), applied to every paid registration
    // regardless of the organiser's plan.
    const processingFee = this.payments.computeProcessingFee(basePrice);

    const totalAmount = basePrice + processingFee;

    // The full total is paid via Razorpay (the processing fee is never waived).
    const razorpayAmount = totalAmount;

    if (razorpayAmount === 0) {
      return this.completeRSVP(userId, eventId, dto, event);
    }

    const qrCode = this.generateQRCode();

    const registration = await this.prisma.eventRegistration.create({
      data: {
        eventId,
        userId,
        ticketTypeId: dto.ticketTypeId,
        quantity,
        groupSize,
        groupMembers:
          (dto.groupMembers as unknown as Prisma.InputJsonValue) ?? undefined,
        totalAmount: new Prisma.Decimal(totalAmount),
        razorpayAmount: new Prisma.Decimal(razorpayAmount),
        processingFee: new Prisma.Decimal(processingFee),
        paymentStatus: razorpayAmount > 0 ? PaymentStatus.PENDING : PaymentStatus.PAID,
        qrCode,
        formResponses: dto.formResponses || {},
        ...utmColumns(dto),
      },
    });

    if (razorpayAmount > 0) {
      return {
        registrationId: registration.id,
        needsPayment: true,
        razorpayAmount,
        totalAmount,
        processingFee,
      };
    }

    // Complete free registration (0 Razorpay amount)
    await this.prisma.$transaction(async (tx) => {
      await tx.eventRegistration.update({
        where: { id: registration.id },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paidAt: new Date(),
        },
      });

      // Increment counts — a group occupies groupSize seats, not 1.
      const seats = this.seatsFor(registration);
      await tx.event.update({
        where: { id: eventId },
        data: { registeredCount: { increment: seats } },
      });

      if (registration.ticketTypeId) {
        await tx.eventTicketType.update({
          where: { id: registration.ticketTypeId },
          data: { soldCount: { increment: seats } },
        });
      }

      // Generate tickets
      for (let i = 0; i < (dto.quantity || 1); i++) {
        await tx.eventTicket.create({
          data: {
            registrationId: registration.id,
            ticketCode: this.generateTicketCode(),
            qrCode: this.generateQRCode(),
          },
        });
      }

      // Group registration → per-seat rows (fast-registration Part 2).
      await this.groupSeats.createSeatsForRegistration(tx, {
        registrationId: registration.id,
        leadUserId: registration.userId,
        seatCount: seats,
        groupMembers: (registration as { groupMembers?: unknown[] | null }).groupMembers ?? dto.groupMembers ?? null,
      });
    });

    return {
      registrationId: registration.id,
      needsPayment: false,
      message: 'Registration successful',
    };
  }

  /**
   * Sends WhatsApp + email registration confirmations for a completed (PAID) registration.
   * Shared by RSVP completion and free-ticket completion in createPaymentOrder.
   */
  private async sendRegistrationConfirmations(registrationId: string) {
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
        const eventDate = this.formatEventDate(fullRegistration.event.startDateTime);
        const eventTime = this.formatEventTime(
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
          await this.whatsappService.sendEventWhatsAppGroupInvite(
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
          // blast skips them (send-once dedup).
          await this.prisma.eventRegistration.update({
            where: { id: fullRegistration.id },
            data: { whatsappInviteSentAt: new Date() },
          });
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

    // Send email notification (non-blocking)
    const identity = await this.prisma.userIdentity.findFirst({
      where: { userId: fullRegistration.userId, email: { not: null }, isPrimary: true },
      select: { email: true },
    });

    if (identity?.email) {
      const eventDate = this.formatEventDate(fullRegistration.event.startDateTime);
      const eventTime = this.formatEventTime(
        fullRegistration.event.startDateTime,
        fullRegistration.event.endDateTime,
      );

      this.emailService
        .sendRegistrationConfirmation({
          email: identity.email,
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
          ticketCode: undefined,
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
      fullRegistration,
      fullRegistration.event,
      fullRegistration.qrCode,
      undefined,
      identity?.email ?? null,
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
   * Email the group's shared ticket to every member, not just the lead. The
   * whole group shares one QR/ticket, so each member simply receives their own
   * copy at the (now-validated) email they registered with. The lead already
   * receives the standard confirmation, so their address is skipped, as are
   * duplicate member emails. Non-blocking: a failed send never breaks the flow.
   */
  private async sendGroupMemberConfirmations(
    registration: any,
    event: any,
    qrCode: string,
    ticketCode: string | undefined,
    leadEmail: string | null,
  ): Promise<void> {
    const members: GroupMemberDto[] = Array.isArray(registration?.groupMembers)
      ? registration.groupMembers
      : [];
    this.logger.log(
      `[group-email] reg ${registration?.id}: ${members.length} member(s), lead=${leadEmail ?? 'none'}`,
    );
    if (members.length === 0) return;

    const eventDate = this.formatEventDate(event.startDateTime);
    const eventTime = this.formatEventTime(event.startDateTime, event.endDateTime);
    const lead = (leadEmail ?? '').trim().toLowerCase();
    const seen = new Set<string>();

    for (const m of members) {
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
          qrCode,
          ticketCode,
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

  async completeRSVP(userId: string, eventId: string, dto: RegisterForEventDto, event: any) {
    const qrCode = this.generateQRCode();

    const registration = await this.prisma.$transaction(async (tx) => {
      const reg = await tx.eventRegistration.create({
        data: {
          eventId,
          userId,
          ticketTypeId: dto.ticketTypeId,
          quantity: dto.quantity || 1,
          groupSize: dto.groupSize ?? null,
          groupMembers:
          (dto.groupMembers as unknown as Prisma.InputJsonValue) ?? undefined,
          totalAmount: new Prisma.Decimal(0),
          paymentStatus: PaymentStatus.PAID,
          paidAt: new Date(),
          qrCode,
          formResponses: dto.formResponses || {},
          ...utmColumns(dto),
        },
      });

      const seats = this.seatsFor(reg);
      await tx.event.update({
        where: { id: eventId },
        data: { registeredCount: { increment: seats } },
      });

      if (dto.ticketTypeId) {
        await tx.eventTicketType.update({
          where: { id: dto.ticketTypeId },
          data: { soldCount: { increment: seats } },
        });
      }

      for (let i = 0; i < (dto.quantity || 1); i++) {
        await tx.eventTicket.create({
          data: {
            registrationId: reg.id,
            ticketCode: this.generateTicketCode(),
            qrCode: this.generateQRCode(),
          },
        });
      }

      // Free group RSVPs are still groups — seed their seat rows too, so a group
      // RSVP is never left with a JSON roster but no seats (the divergence this
      // path used to create). Any provided members become CLAIMED seats.
      await this.groupSeats.createSeatsForRegistration(tx, {
        registrationId: reg.id,
        leadUserId: userId,
        seatCount: this.seatsFor(reg),
        groupMembers: (reg as { groupMembers?: unknown[] | null }).groupMembers ?? dto.groupMembers ?? null,
      });

      return reg;
    });

    // Fetch full registration with user and event for notifications
    const fullRegistration = await this.prisma.eventRegistration.findUnique({
      where: { id: registration.id },
      include: {
        user: true,
        // space.name feeds the calendar (.ics) ORGANIZER line.
        event: {
          include: {
            space: {
              select: { name: true },
            },
          },
        },
      },
    });

    // Send WhatsApp notification
    try {
      if (fullRegistration?.user?.mobileNumber) {
        const eventDate = this.formatEventDate(fullRegistration.event.startDateTime);
        const eventTime = this.formatEventTime(
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
      this.logger.error('Failed to send RSVP WhatsApp notification', error);
    }

    // Send email notification (non-blocking)
    const identity = await this.prisma.userIdentity.findFirst({
      where: { userId, email: { not: null }, isPrimary: true },
      select: { email: true },
    });

    if (identity?.email && fullRegistration) {
      const eventDate = this.formatEventDate(fullRegistration.event.startDateTime);
      const eventTime = this.formatEventTime(
        fullRegistration.event.startDateTime,
        fullRegistration.event.endDateTime,
      );

      this.emailService.sendRegistrationConfirmation({
        email: identity.email,
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
        ticketCode: undefined,
        // Raw fields for the "Add to calendar" .ics attachment.
        eventSlug: fullRegistration.event.slug,
        eventStartDateTime: fullRegistration.event.startDateTime,
        eventEndDateTime: fullRegistration.event.endDateTime,
        eventTimezone: fullRegistration.event.timezone,
        eventType: fullRegistration.event.type,
        venueAddress: fullRegistration.event.venueAddress || undefined,
        eventDescription: fullRegistration.event.description || undefined,
        organiserName: fullRegistration.event.space?.name || undefined,
      }).catch(err => this.logger.error('Failed to send registration confirmation email', err));
    }

    // Email the shared ticket to each group member (skips the lead + dupes).
    if (fullRegistration) {
      await this.sendGroupMemberConfirmations(
        fullRegistration,
        fullRegistration.event,
        fullRegistration.qrCode,
        undefined,
        identity?.email ?? null,
      );
    }

    this.logger.log(`RSVP completed for user ${userId}, event ${eventId}`);


    return {
      registrationId: registration.id,
      message: 'RSVP successful',
      qrCode: registration.qrCode,
    };
  }

  /**
   * Puts a user in the queue for a sold-out ticket. The queue itself lives in
   * `WaitlistService`; this stays as the entry point the registration paths
   * already call when they run out of seats.
   */
  async addToWaitlist(
    userId: string,
    eventId: string,
    dto: Pick<
      RegisterForEventDto,
      'ticketTypeId' | 'quantity' | 'groupSize' | 'groupMembers' | 'formResponses'
    >,
  ): Promise<WaitlistJoinResponseDto> {
    if (!dto.ticketTypeId) {
      throw new BadRequestException(
        'Select a ticket before joining the waiting list',
      );
    }

    return this.waitlist.join(userId, eventId, dto.ticketTypeId, {
      quantity: dto.quantity,
      groupSize: dto.groupSize,
      groupMembers: dto.groupMembers,
      formResponses: dto.formResponses,
      qrCode: this.generateQRCode(),
    });
  }

  async createRazorpayOrder(userId: string, registrationId: string) {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: { event: true },
    });

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    if (registration.userId !== userId) {
      throw new BadRequestException('Unauthorized');
    }

    if (registration.paymentStatus !== PaymentStatus.PENDING) {
      throw new BadRequestException('Payment already processed');
    }

    const order = await this.payments.createOrder({
      amount: Number(registration.razorpayAmount),
      receipt: `reg_${registrationId}`,
      notes: {
        registrationId,
        userId,
        eventId: registration.eventId,
      },
    });

    await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: { orderId: order.orderId },
    });

    return {
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
    };
  }

  /**
   * Returns the user's first PAID registration for this event, for backward compatibility
   * with callers expecting a single result (e.g. legacy "already registered" checks).
   */
  async getMyRegistration(userId: string, eventId: string) {
    const registrations = await this.getMyRegistrationsForEvent(userId, eventId);
    return registrations[0] || null;
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
  private async sendInviteToGroupMemberSeats(
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
        await this.whatsappService.sendEventWhatsAppGroupInvite(mobile, {
          userName: seatMemberName(seat),
          eventTitle: ctx.eventTitle,
          inviteUrl: ctx.inviteUrl,
          isCommunity: ctx.isCommunity,
        });
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

    // A group booked before seat-seeding shipped has its members only in the
    // legacy `groupMembers` JSON, so the seat-based member send below would skip
    // them. Materialise seats first (idempotent) so every member is reachable.
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
            await this.whatsappService.sendEventWhatsAppGroupInvite(
              reg.user.mobileNumber,
              {
                userName: reg.user.fullName || reg.user.username || 'there',
                eventTitle: event.title,
                inviteUrl,
                isCommunity,
              },
            );
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
      const memberResult = await this.sendInviteToGroupMemberSeats(memberSeats, {
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
        groupMembers: true,
        eventId: true,
        ticketTypeId: true,
      },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    if (reg.userId !== userId) throw new BadRequestException('Unauthorized');

    const groupSize = reg.groupSize ?? 0;

    // GroupSeat rows are the source of truth for the roster. Fall back to the
    // legacy `groupMembers` JSON only for a group that somehow has no seats yet
    // (un-backfilled) — transitional, removed when the column is dropped.
    const fromSeats = await this.groupSeats.getRoster(registrationId);
    const members =
      fromSeats ??
      (() => {
        const stored = Array.isArray(reg.groupMembers) ? reg.groupMembers : [];
        // Normalise each slot; blanks are expected for legacy/incomplete rosters.
        return Array.from({ length: Math.max(groupSize, stored.length) }).map(
          (_, i) => {
            const m = (stored[i] ?? {}) as Record<string, any>;
            const isObj = m && typeof m === 'object' && !Array.isArray(m);
            const custom =
              isObj && m.customFields && typeof m.customFields === 'object' && !Array.isArray(m.customFields)
                ? (m.customFields as Record<string, any>)
                : {};
            return {
              name: isObj && typeof m.name === 'string' ? m.name : '',
              email: isObj && typeof m.email === 'string' ? m.email : '',
              mobile: isObj && typeof m.mobile === 'string' ? m.mobile : '',
              gender: isObj && typeof m.gender === 'string' ? m.gender : '',
              customFields: custom,
            };
          },
        );
      })();

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
      await this.sendGroupMemberConfirmations(
        { groupMembers: filledMembers },
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

    if (!(await isSpaceAdmin(this.prisma, userId, event.spaceId))) {
      throw new ForbiddenException('Unauthorized');
    }

    const registrations = await this.prisma.eventRegistration.findMany({
      where: { eventId, ...COUNTS_AS_ATTENDING },
      select: {
        id: true,
        quantity: true,
        groupSize: true,
        ticketTypeId: true,
        ticketType: { select: { id: true, name: true, kind: true } },
      },
    });

    // Group seat claim state (fast-registration Part 2): a paid group holds its
    // seats for capacity, but only CLAIMED seats are *attendees*. Aggregate
    // per-registration seat totals + claimed counts in one query so an unclaimed
    // pay-first seat is not counted as a person here.
    const seatAgg = await this.prisma.groupSeat.groupBy({
      by: ['registrationId', 'status'],
      where: { registration: { eventId } },
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
        : this.seatsFor(r);

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
   * Load an event + one of its ticket types (with custom form fields) for the
   * attendee-management flows, or throw. Shared by the template, import and
   * single-add paths so they agree on what a valid target is.
   */
  /**
   * Refuse organiser-driven attendee changes (import / manual add) once the
   * admin-configured post-event action window has closed. Shares the exact
   * deadline used for certificate issuance so both surfaces close together.
   */
  private assertAttendeeActionsOpen(endDateTime: Date) {
    if (!this.platformConfig.isWithinPostEventWindow(endDateTime)) {
      const days = this.platformConfig.getPostEventActionWindowDays();
      throw new ForbiddenException(
        `Adding attendees closed ${days} day${days === 1 ? '' : 's'} after this event ended.`,
      );
    }
  }

  private async loadEventTicketForManage(eventId: string, ticketTypeId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');

    const ticketType = await this.prisma.eventTicketType.findFirst({
      where: { id: ticketTypeId, eventId },
      include: { formFields: { orderBy: { order: 'asc' } } },
    });
    if (!ticketType) throw new NotFoundException('Ticket type not found');

    return { event, ticketType };
  }

  /** Reduce a ticket type + its form fields to the pure import contract. */
  private toImportShape(ticketType: {
    kind: string;
    minGroupSize: number | null;
    maxGroupSize: number | null;
    formFields: {
      id: string;
      label: string;
      type: FormFieldType;
      isRequired: boolean;
      perGroup: boolean;
      showIf: Prisma.JsonValue;
    }[];
  }): ImportTicketShape {
    return {
      kind: ticketType.kind as ImportTicketShape['kind'],
      minGroupSize: ticketType.minGroupSize,
      maxGroupSize: ticketType.maxGroupSize,
      // Headings have no answer and files can't come from a spreadsheet, so
      // neither gets a column. A conditional question is never forced: whether
      // it applies depends on another answer in the same row.
      formFields: ticketType.formFields
        .filter((f) => f.type !== 'SECTION' && f.type !== 'FILE')
        .map((f) => ({
          id: f.id,
          label: f.label,
          required: f.isRequired && !f.showIf,
          perGroup: f.perGroup,
        })),
    };
  }

  /**
   * Run the answer policy over parsed CSV rows: each row's answers are typed
   * and limit-checked (required is the importer's job, above). A bad answer
   * marks just that row as errored instead of failing the whole file.
   */
  private checkImportAnswers(
    eventId: string,
    ticketType: { kind: string; formFields: FormFieldLike[] },
    rows: ParsedImportRow[],
  ) {
    const isGroup = ticketType.kind === 'GROUP';
    const fields = ticketType.formFields;
    const teamFields = isGroup ? fields.filter((f) => f.perGroup) : fields;
    const memberFields = isGroup ? fields.filter((f) => !f.perGroup) : [];
    const opts = { eventId, enforceRequired: false, uploaderIds: [] };
    for (const row of rows) {
      if (row.error) continue;
      const team = checkAnswers(teamFields, row.formResponses, opts);
      const errors = [...team.errors];
      row.formResponses = team.answers;
      for (const m of row.groupMembers ?? []) {
        const r = checkAnswers(memberFields, m.customFields, opts);
        errors.push(...r.errors);
        m.customFields = r.answers;
      }
      if (errors.length) row.error = errors.slice(0, 2).join(' ');
    }
  }

  /**
   * The CSV template for one ticket type. Columns are derived from the ticket's
   * kind (group tickets get member columns) and its custom form fields, so what
   * an organiser downloads always matches what the importer reads back.
   */
  async buildImportTemplate(eventId: string, ticketTypeId: string) {
    const { event, ticketType } = await this.loadEventTicketForManage(
      eventId,
      ticketTypeId,
    );
    const spec = buildTemplateSpec(this.toImportShape(ticketType));
    const { buffer } = await buildExportFile(
      'csv',
      `${ticketType.name} attendees`,
      spec.header,
      [spec.sample],
    );
    const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
    return {
      buffer,
      filename: `${safe(event.slug)}-${safe(ticketType.name)}-template.csv`,
    };
  }

  /**
   * Find an account by its email identity, or mint a claimable placeholder one.
   *
   * Accounts here are keyed by mobile, not email, so a fresh import row has no
   * real account and no phone number. We reuse the exact pattern auth uses for
   * email/OAuth sign-ups: create a User with a synthetic placeholder mobile plus
   * an EMAIL identity carrying the real address. When that person later signs in
   * with the same email, auth resolves them by email identity and links — the
   * imported registration is already theirs, no merge tooling needed.
   *
   * The provided mobile is deliberately NOT used as the account's mobileNumber:
   * it is unverified, may be a typo, and claiming a real number could block that
   * person's genuine sign-up. It rides along on the registration/group data only.
   */
  private async findOrCreateUserByEmail(
    email: string,
    name: string,
  ): Promise<string> {
    const normalized = email.trim().toLowerCase();
    const existing = await this.prisma.userIdentity.findFirst({
      where: { email: normalized },
      select: { userId: true, user: { select: { fullName: true } } },
    });
    if (existing) {
      // Backfill a display name if the account never had one (e.g. a bare
      // placeholder created by an earlier import).
      if (!existing.user?.fullName && name) {
        await this.prisma.user
          .update({ where: { id: existing.userId }, data: { fullName: name } })
          .catch(() => undefined);
      }
      return existing.userId;
    }

    // Collision-safe placeholder: random 9 digits (not Date.now, which repeats
    // inside a tight import loop). Retried a few times on the tiny chance of a
    // unique clash.
    for (let attempt = 0; attempt < 5; attempt++) {
      const placeholderMobile = `+0${crypto.randomInt(100000000, 999999999)}`;
      try {
        const user = await this.prisma.user.create({
          data: {
            mobileNumber: placeholderMobile,
            mobileVerified: false,
            fullName: name || null,
            identities: {
              create: {
                provider: Provider.EMAIL,
                providerUserId: normalized,
                email: normalized,
                emailVerified: false,
                isPrimary: true,
              },
            },
          },
          select: { id: true },
        });
        return user.id;
      } catch (err) {
        // A concurrent create may have won the email identity race — re-resolve.
        const raced = await this.prisma.userIdentity.findFirst({
          where: { email: normalized },
          select: { userId: true },
        });
        if (raced) return raced.userId;
        if (attempt === 4) throw err; // exhausted placeholder retries
      }
    }
    // Unreachable, but satisfies the type checker.
    throw new BadRequestException(`Could not resolve an account for ${email}`);
  }

  /**
   * Read-only counterpart to {@link findOrCreateUserByEmail}: resolve an existing
   * account by its email identity, or `null` if none exists yet. Used by the
   * import preview (dry-run), which must never create the placeholder accounts the
   * real import would — a `null` here is what tells the reviewer "this row would
   * create a brand-new account".
   */
  private async resolveUserIdByEmail(email: string): Promise<string | null> {
    const normalized = email.trim().toLowerCase();
    const existing = await this.prisma.userIdentity.findFirst({
      where: { email: normalized },
      select: { userId: true },
    });
    return existing?.userId ?? null;
  }

  /**
   * Decide what an import will do with one parsed row, WITHOUT writing anything.
   * This is the single source of truth shared by the dry-run preview and the real
   * import, so the review a curator approves always matches what actually happens.
   *
   * `state` is mutated across the batch: `seen` catches duplicate emails within
   * the file, and `remaining` is the capacity the caller decrements once a row is
   * committed (on decision here for the preview, on successful create for import).
   */
  private async classifyImportRow(
    eventId: string,
    ticketTypeId: string,
    row: ParsedImportRow,
    state: { remaining: number | null; seen: Set<string> },
  ): Promise<
    | { decision: 'create'; seats: number; existingUserId: string | null }
    | { decision: 'skip' | 'error'; reason: string }
  > {
    if (row.error) return { decision: 'error', reason: row.error };
    if (state.seen.has(row.email)) {
      return { decision: 'skip', reason: 'Duplicate email within this file.' };
    }
    state.seen.add(row.email);

    const seats = row.groupSize && row.groupSize > 1 ? row.groupSize : 1;
    if (state.remaining != null && seats > state.remaining) {
      return {
        decision: 'error',
        reason: `Not enough capacity left (need ${seats}, ${state.remaining} remaining).`,
      };
    }

    const existingUserId = await this.resolveUserIdByEmail(row.email);
    if (
      existingUserId &&
      (await this.hasActiveRegistration(eventId, existingUserId, ticketTypeId))
    ) {
      return { decision: 'skip', reason: 'Already registered for this ticket.' };
    }
    return { decision: 'create', seats, existingUserId };
  }

  /**
   * Is this (event, user, ticketType) already an active registration? Mirrors the
   * partial unique index: REFUNDED / CANCELLED rows don't count, so a previously
   * cancelled attendee can be re-added.
   */
  private async hasActiveRegistration(
    eventId: string,
    userId: string,
    ticketTypeId: string,
  ): Promise<boolean> {
    const existing = await this.prisma.eventRegistration.findFirst({
      where: {
        eventId,
        userId,
        ticketTypeId,
        status: { not: RegistrationStatus.CANCELLED },
        paymentStatus: { not: PaymentStatus.REFUNDED },
      },
      select: { id: true },
    });
    return existing !== null;
  }

  /**
   * Create one confirmed (comped, zero-amount) registration in a transaction:
   * the row, seat/registered counters, per-ticket rows and group seats. Used by
   * bulk import and by the comp branch of single-add. Payment is never involved
   * here — a manually added attendee is free.
   */
  private async createComplimentaryRegistration(
    eventId: string,
    userId: string,
    ticketTypeId: string,
    opts: {
      groupSize: number | null;
      groupMembers: unknown[] | null;
      formResponses: Record<string, unknown>;
    },
  ): Promise<string> {
    const qrCode = this.generateQRCode();
    const seats = opts.groupSize && opts.groupSize > 1 ? opts.groupSize : 1;

    const registration = await this.prisma.$transaction(async (tx) => {
      const reg = await tx.eventRegistration.create({
        data: {
          eventId,
          userId,
          ticketTypeId,
          quantity: 1,
          groupSize: opts.groupSize,
          groupMembers:
            (opts.groupMembers as unknown as Prisma.InputJsonValue) ?? undefined,
          totalAmount: new Prisma.Decimal(0),
          paymentStatus: PaymentStatus.PAID,
          paidAt: new Date(),
          qrCode,
          formResponses: opts.formResponses as Prisma.InputJsonValue,
        },
      });

      await tx.event.update({
        where: { id: eventId },
        data: { registeredCount: { increment: seats } },
      });
      await tx.eventTicketType.update({
        where: { id: ticketTypeId },
        data: { soldCount: { increment: seats } },
      });
      await tx.eventTicket.create({
        data: {
          registrationId: reg.id,
          ticketCode: this.generateTicketCode(),
          qrCode: this.generateQRCode(),
        },
      });
      await this.groupSeats.createSeatsForRegistration(tx, {
        registrationId: reg.id,
        leadUserId: userId,
        seatCount: seats,
        groupMembers: opts.groupMembers ?? null,
      });
      return reg;
    });


    return registration.id;
  }

  /**
   * Bulk-import attendees for one ticket type from an uploaded CSV. No payment is
   * taken — every imported attendee is comped. Enforces the ticket's remaining
   * capacity across the batch, skips duplicates (already-registered emails), and
   * returns a per-row report so the organiser sees exactly what happened.
   */
  async importAttendees(
    eventId: string,
    ticketTypeId: string,
    csvText: string,
    sendEmails: boolean,
  ): Promise<{
    ticketTypeName: string;
    total: number;
    created: number;
    skipped: number;
    errored: number;
    rows: Array<{
      line: number;
      name: string;
      email: string;
      status: 'created' | 'skipped' | 'errored';
      reason?: string;
    }>;
  }> {
    const { event, ticketType } = await this.loadEventTicketForManage(
      eventId,
      ticketTypeId,
    );
    this.assertAttendeeActionsOpen(event.endDateTime);
    const shape = this.toImportShape(ticketType);
    const { rows: parsed, fileError } = parseImportRows(shape, parseCsv(csvText));
    if (fileError) throw new BadRequestException(fileError);
    this.checkImportAnswers(eventId, ticketType, parsed);
    if (parsed.length === 0) {
      throw new BadRequestException('No attendee rows found in the file.');
    }

    // Remaining capacity for this batch (null = unlimited). A group consumes its
    // whole size; individuals consume one seat.
    const remaining: number | null =
      ticketType.totalQuantity == null
        ? null
        : Math.max(0, ticketType.totalQuantity - ticketType.soldCount);

    const report: Array<{
      line: number;
      name: string;
      email: string;
      status: 'created' | 'skipped' | 'errored';
      reason?: string;
    }> = [];
    // Shared batch state: `seen` de-dupes emails within the file, `remaining`
    // tracks capacity as we go. Same classifier the preview uses, so the report
    // matches whatever the curator reviewed.
    const state = { remaining, seen: new Set<string>() };

    for (const row of parsed) {
      const verdict = await this.classifyImportRow(
        eventId,
        ticketTypeId,
        row,
        state,
      );
      if (verdict.decision !== 'create') {
        report.push({
          ...this.rowHead(row),
          status: verdict.decision === 'error' ? 'errored' : 'skipped',
          reason: verdict.reason,
        });
        continue;
      }

      try {
        const userId = await this.findOrCreateUserByEmail(row.email, row.name);
        const registrationId = await this.createComplimentaryRegistration(
          eventId,
          userId,
          ticketTypeId,
          {
            groupSize: row.groupSize,
            groupMembers: row.groupMembers,
            formResponses: row.formResponses,
          },
        );
        if (state.remaining != null) state.remaining -= verdict.seats;
        if (sendEmails) {
          // Fire-and-forget: a slow SMTP hop must not stall a large import.
          void this.sendRegistrationConfirmations(registrationId);
        }
        report.push({ ...this.rowHead(row), status: 'created' });
      } catch (err) {
        this.logger.error(
          `import: row ${row.line} (${row.email}) failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        report.push({
          ...this.rowHead(row),
          status: 'errored',
          reason: 'Could not create the registration.',
        });
      }
    }

    await this.cache.invalidateCheckinCache(eventId).catch(() => undefined);

    return {
      ticketTypeName: ticketType.name,
      total: report.length,
      created: report.filter((r) => r.status === 'created').length,
      skipped: report.filter((r) => r.status === 'skipped').length,
      errored: report.filter((r) => r.status === 'errored').length,
      rows: report,
    };
  }

  private rowHead(row: ParsedImportRow) {
    return { line: row.line, name: row.name, email: row.email };
  }

  /**
   * Dry-run a bulk import: parse + validate the CSV and predict, row by row, what
   * the real import would do — WITHOUT creating any accounts or registrations.
   * Reuses {@link classifyImportRow}, the same verdict logic the live import runs,
   * so the review a curator sees here is exactly what committing will produce.
   *
   * `outcome` is `create` (a registration will be added — `newAccount` flags when
   * that also mints a fresh account), `skip` (duplicate / already registered) or
   * `error` (bad row / no capacity).
   */
  async previewImport(
    eventId: string,
    ticketTypeId: string,
    csvText: string,
  ): Promise<{
    ticketTypeName: string;
    total: number;
    willCreate: number;
    willSkip: number;
    willError: number;
    newAccounts: number;
    remainingCapacity: number | null;
    rows: Array<{
      line: number;
      name: string;
      email: string;
      outcome: 'create' | 'skip' | 'error';
      newAccount?: boolean;
      reason?: string;
    }>;
  }> {
    const { event, ticketType } = await this.loadEventTicketForManage(
      eventId,
      ticketTypeId,
    );
    this.assertAttendeeActionsOpen(event.endDateTime);
    const shape = this.toImportShape(ticketType);
    const { rows: parsed, fileError } = parseImportRows(shape, parseCsv(csvText));
    if (fileError) throw new BadRequestException(fileError);
    this.checkImportAnswers(eventId, ticketType, parsed);
    if (parsed.length === 0) {
      throw new BadRequestException('No attendee rows found in the file.');
    }

    const remainingCapacity: number | null =
      ticketType.totalQuantity == null
        ? null
        : Math.max(0, ticketType.totalQuantity - ticketType.soldCount);
    const state = { remaining: remainingCapacity, seen: new Set<string>() };

    const rows: Array<{
      line: number;
      name: string;
      email: string;
      outcome: 'create' | 'skip' | 'error';
      newAccount?: boolean;
      reason?: string;
    }> = [];

    for (const row of parsed) {
      const verdict = await this.classifyImportRow(
        eventId,
        ticketTypeId,
        row,
        state,
      );
      if (verdict.decision === 'create') {
        // The preview has no create to succeed/fail, so charge capacity on the
        // decision — this is what makes a later row overflow show as an error.
        if (state.remaining != null) state.remaining -= verdict.seats;
        rows.push({
          ...this.rowHead(row),
          outcome: 'create',
          newAccount: verdict.existingUserId == null,
        });
      } else {
        rows.push({
          ...this.rowHead(row),
          outcome: verdict.decision,
          reason: verdict.reason,
        });
      }
    }

    return {
      ticketTypeName: ticketType.name,
      total: rows.length,
      willCreate: rows.filter((r) => r.outcome === 'create').length,
      willSkip: rows.filter((r) => r.outcome === 'skip').length,
      willError: rows.filter((r) => r.outcome === 'error').length,
      newAccounts: rows.filter((r) => r.outcome === 'create' && r.newAccount)
        .length,
      remainingCapacity,
      rows,
    };
  }

  /**
   * Manually add a single attendee. When the ticket is free (or the organiser
   * comps it) the attendee is confirmed immediately. When `collectPayment` is set
   * on a paid ticket, a PENDING registration is created and Razorpay emails/texts
   * the attendee a payment link; the existing `payment.captured` webhook confirms
   * the seat when they pay (resolved via the link's `notes.registrationId`).
   */
  async manualAddAttendee(
    eventId: string,
    dto: {
      ticketTypeId: string;
      name: string;
      email: string;
      mobile?: string;
      gender: string;
      groupSize?: number;
      groupMembers?: Array<{
        name: string;
        email?: string;
        mobile?: string;
        gender?: string;
        customFields?: Record<string, unknown>;
      }>;
      formResponses?: Record<string, unknown>;
      leadCustomFields?: Record<string, unknown>;
      collectPayment?: boolean;
      sendTicketEmail?: boolean;
    },
    /** The curator adding them; their uploads may be referenced by answers. */
    actorId?: string,
  ) {
    const { event, ticketType } = await this.loadEventTicketForManage(
      eventId,
      dto.ticketTypeId,
    );
    this.assertAttendeeActionsOpen(event.endDateTime);

    // Resolve the group size + how many seats this booking consumes.
    let groupSize: number | null = null;
    if (ticketType.kind === 'GROUP') {
      const size = dto.groupSize ?? ticketType.minGroupSize ?? 1;
      if (
        (ticketType.minGroupSize != null && size < ticketType.minGroupSize) ||
        (ticketType.maxGroupSize != null && size > ticketType.maxGroupSize)
      ) {
        throw new BadRequestException(
          `Group size must be between ${ticketType.minGroupSize} and ${ticketType.maxGroupSize}`,
        );
      }
      groupSize = size;
    }
    const seats = groupSize && groupSize > 1 ? groupSize : 1;

    // Capacity (null = unlimited).
    if (
      ticketType.totalQuantity != null &&
      ticketType.soldCount + seats > ticketType.totalQuantity
    ) {
      throw new BadRequestException('Not enough seats left on this ticket type.');
    }

    const userId = await this.findOrCreateUserByEmail(dto.email, dto.name);
    if (await this.hasActiveRegistration(eventId, userId, dto.ticketTypeId)) {
      throw new ConflictException(
        'This person is already registered for this ticket type.',
      );
    }

    // Custom fields split two ways for a group: per-member answers live on each
    // member (the lead being member 1, carrying `leadCustomFields`), while the
    // team-wide (per-group) answers live on the registration (`formResponses`).
    // For an individual ticket there is one person, so their answers are the
    // registration `formResponses` as usual.
    const isGroup = ticketType.kind === 'GROUP';
    const groupMembers = isGroup
      ? [
          {
            name: dto.name,
            email: dto.email,
            mobile: dto.mobile ?? null,
            gender: dto.gender,
            customFields: dto.leadCustomFields ?? {},
          },
          ...(dto.groupMembers ?? []).map((m) => ({
            name: m.name,
            email: m.email ?? null,
            mobile: m.mobile ?? null,
            gender: m.gender ?? null,
            customFields: m.customFields ?? {},
          })),
        ]
      : null;
    // For an individual, gender rides in the registration-level responses (the
    // same `gender` key the attendee detail view reads). For a group it lives on
    // each member above, so the registration bag stays the team-wide answers.
    // Answer policy: types and limits apply, but a curator adding someone may
    // not know every answer, so required questions aren't forced here.
    const checkedResponses = await enforceFormAnswers(this.prisma, {
      eventId,
      ticketTypeId: dto.ticketTypeId,
      isGroup,
      formResponses: dto.formResponses,
      members: groupMembers ?? undefined,
      required: { team: false, members: 'none' },
      uploaderIds: actorId ? [actorId] : [],
    });
    const formResponses = isGroup
      ? checkedResponses
      : { ...checkedResponses, gender: dto.gender };

    const price = Number(ticketType.price);
    const wantsPayment = Boolean(dto.collectPayment) && price > 0;

    // Comping a PAID ticket (adding for free instead of collecting payment) is
    // blocked per-event unless a Platform Admin approved a FreeAttendeeAddRequest
    // for it — so the platform fee is never silently waived. Free/RSVP tickets
    // carry no price and are always comped, so they are never gated.
    if (price > 0 && !wantsPayment && !event.allowFreeAttendeeAdd) {
      throw new ForbiddenException(
        'Adding a paid attendee for free needs platform approval for this event. ' +
          'Collect payment instead, or request the free-add exception.',
      );
    }

    if (!wantsPayment) {
      // Comp: confirmed, zero-amount registration.
      const registrationId = await this.createComplimentaryRegistration(
        eventId,
        userId,
        dto.ticketTypeId,
        { groupSize, groupMembers, formResponses },
      );
      if (dto.sendTicketEmail !== false) {
        void this.sendRegistrationConfirmations(registrationId);
      }
      return {
        registrationId,
        paymentStatus: 'PAID' as const,
        message: 'Attendee added and confirmed.',
      };
    }

    // Collect payment: PENDING registration + Razorpay payment link.
    const basePrice =
      ticketType.kind === 'GROUP' && ticketType.groupPricingMode === 'PER_PERSON'
        ? price * (groupSize ?? 1)
        : price;
    const processingFee = this.payments.computeProcessingFee(basePrice);
    const totalAmount = basePrice + processingFee;

    const registration = await this.prisma.eventRegistration.create({
      data: {
        eventId,
        userId,
        ticketTypeId: dto.ticketTypeId,
        quantity: 1,
        groupSize,
        groupMembers:
          (groupMembers as unknown as Prisma.InputJsonValue) ?? undefined,
        totalAmount: new Prisma.Decimal(totalAmount),
        razorpayAmount: new Prisma.Decimal(totalAmount),
        processingFee: new Prisma.Decimal(processingFee),
        paymentStatus: PaymentStatus.PENDING,
        qrCode: this.generateQRCode(),
        formResponses: formResponses as Prisma.InputJsonValue,
      },
    });

    const link = await this.payments.createPaymentLink({
      amount: totalAmount,
      description: `${event.title} — ${ticketType.name}`,
      customer: {
        name: dto.name,
        email: dto.email,
        contact: dto.mobile,
      },
      referenceId: registration.id,
      notes: { registrationId: registration.id, eventId },
    });

    return {
      registrationId: registration.id,
      paymentStatus: 'PENDING' as const,
      paymentLinkUrl: link.shortUrl,
      amount: totalAmount,
      message: 'Payment link sent to the attendee.',
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

    if (!(await isSpaceAdmin(this.prisma, userId, event.spaceId))) {
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
      // above). Their captured details live in two JSONB blobs that Prisma
      // cannot substring-search: `event_registrations.group_members` (the older
      // shared-ticket capture) and `group_seats.member_details` (the
      // invite/claim flow), alongside a seat's invite email and — once a member
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

  async exportRegistrations(
    userId: string,
    eventId: string,
    format: ExportFormat = 'csv',
    type: 'attendees' | 'transactions' = 'attendees',
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        space: {
          include: { subscription: true },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const subscription = event.space.subscription;
    if (!subscription) {
      throw new BadRequestException('This space has no subscription');
    }
    const planLimits = this.planConfig.getEffectiveLimits(subscription);
    if (!planLimits.hasBulkExport) {
      throw new BadRequestException('Bulk export not available in your plan');
    }

    if (!(await isSpaceAdmin(this.prisma, userId, event.spaceId))) {
      throw new ForbiddenException('Unauthorized');
    }

    const registrations = await this.prisma.eventRegistration.findMany({
      where: { eventId },
      orderBy: { registeredAt: 'desc' },
      include: {
        user: {
          select: {
            fullName: true,
            username: true,
            mobileNumber: true,
            identities: {
              select: { email: true },
              take: 1,
            },
          },
        },
        ticketType: true,
      },
    });

    // Transactions export: payment/transaction data only, and only rows where
    // money actually moved (free RSVPs are excluded).
    if (type === 'transactions') {
      const txns = registrations.filter(
        (reg: any) =>
          Number(reg.totalAmount) > 0 || reg.paymentId || reg.orderId,
      );
      // Money model (all in INR, stored as Decimal):
      //   totalAmount   = base ticket price + processingFee  (the FULL amount
      //                   the attendee was charged)
      //   processingFee = platform/gateway fee — retained, never refunded
      //   refundedAmount= amount returned to the attendee (base-only policy)
      //
      // A single "Amount" column conflated all of this, so an organiser reading
      // the export couldn't tell gross cash-in from fees from take-home. We now
      // break it into the same figures the dashboard tiles show:
      //   Collected = gross the attendee actually paid (only when captured)
      //   Fee       = platform's cut
      //   Refunded  = returned to the attendee
      //   Net       = what the organiser keeps = Collected − Fee − Refunded
      //
      // PENDING/FAILED rows moved no money, so their Collected/Fee are 0 (they
      // stay in the export for the audit trail, but never inflate the totals).
      // Net is cash-accurate: Net = Collected − Fee − Refunded, using the
      // amounts ACTUALLY captured. This handles every status correctly and can
      // never go negative (the refund is base-only, i.e. ≤ Collected − Fee):
      //   - PENDING / FAILED → nothing captured → Collected/Fee/Net = 0.
      //   - REFUNDED / PARTIALLY_REFUNDED → the Refunded column is subtracted,
      //     so a full refund nets to 0 and a partial refund nets the retained
      //     part.
      //   - CANCELLED but already refunded → nets to 0. CANCELLED but the
      //     refund hasn't been processed yet (payment still PAID) → nets the
      //     base, which is genuine cash the organiser is still holding and owes
      //     back, NOT phantom revenue. The new Registration Status column makes
      //     that visible so the figure is never mistaken for a clean sale.
      const CAPTURED_STATUSES = new Set([
        'PAID',
        'PARTIALLY_REFUNDED',
        'REFUNDED',
      ]);
      const header = [
        'Name',
        'Email',
        'Ticket Type',
        'Registration Status',
        'Collected (INR)',
        'Processing Fee (INR)',
        'Refunded (INR)',
        'Net (INR)',
        'Payment Status',
        'Payment ID',
        'Order ID',
        'Paid At',
      ];
      const rows = txns.map((reg: any) => {
        const captured = CAPTURED_STATUSES.has(reg.paymentStatus);
        const gross = Number(reg.totalAmount) || 0;
        const fee = Number(reg.processingFee) || 0;
        const refunded = Number(reg.refundedAmount) || 0;
        const collected = captured ? gross : 0;
        const feeCharged = captured ? fee : 0;
        const net = collected - feeCharged - refunded;
        return [
          reg.user.fullName || '',
          reg.user.identities?.[0]?.email || '',
          reg.ticketType?.name || 'RSVP',
          reg.status,
          collected.toFixed(2),
          feeCharged.toFixed(2),
          refunded.toFixed(2),
          net.toFixed(2),
          reg.paymentStatus,
          reg.paymentId || '',
          reg.orderId || '',
          reg.paidAt ? reg.paidAt.toISOString() : '',
        ];
      });

      const file = await buildExportFile(
        format,
        `${event.title} — Transactions`,
        header,
        rows,
      );
      return {
        buffer: file.buffer,
        contentType: file.contentType,
        filename: `${event.slug}-transactions.${file.extension}`,
      };
    }

    // Attendees export: full attendee data plus the custom form responses.
    // Responses are keyed by form-field id, so we resolve the id → label map to
    // give each custom field its own labelled column.
    // Section headings are never answered, so they get no column.
    const formFields = await this.prisma.eventFormField.findMany({
      where: { eventId, type: { not: 'SECTION' } },
      orderBy: { order: 'asc' },
      select: { id: true, label: true },
    });

    // Yes/No as words, picks joined, a file by its name (files themselves
    // are opened from the attendee page with a short-lived link).
    const formatResponse = (value: unknown): string => formatAnswer(value);

    // Group members can be stored either as `{ name, email, mobile, gender,
    // customFields }` or as a flat form-response map keyed by form-field id.
    // Normalise both so a member's real name/email/mobile is never blank.
    const labelById: Record<string, string> = Object.fromEntries(
      formFields.map((f) => [f.id, f.label.toLowerCase()]),
    );
    const MEMBER_ALIASES: Record<'name' | 'email' | 'mobile', string[]> = {
      name: ['name', 'full name', 'fullname', 'attendee name'],
      email: ['email', 'e-mail', 'email address'],
      mobile: ['mobile', 'phone', 'mobile number', 'phone number', 'contact'],
    };
    const flattenMember = (m: any): Record<string, unknown> => {
      const flat: Record<string, unknown> = {};
      if (m && typeof m === 'object') {
        for (const [k, v] of Object.entries(m)) {
          if (k === 'customFields' && v && typeof v === 'object') {
            Object.assign(flat, v as Record<string, unknown>);
          } else {
            flat[k] = v;
          }
        }
      }
      return flat;
    };
    const pickMemberField = (
      flat: Record<string, unknown>,
      aliases: string[],
    ): string => {
      for (const [k, v] of Object.entries(flat)) {
        const value = formatResponse(v).trim();
        if (!value) continue;
        if (aliases.includes(k.toLowerCase()) || aliases.includes(labelById[k]))
          return value;
      }
      return '';
    };

    const header = [
      'Name',
      'Username',
      'Email',
      'Mobile',
      'Ticket Type',
      'Quantity',
      'Status',
      'Payment',
      'Amount (INR)',
      'Registered At',
      'Checked In',
      'Group',
      ...formFields.map((f) => f.label),
    ];

    // Group seats (fast-registration Part 2) are the source of truth for a
    // group's roster — a pay-first group has no `groupMembers` JSON at all, so
    // expanding by seats is the only way to emit its members. Fetch all seats
    // for the group registrations in one query, with the claimer's account for
    // fallback identity.
    const groupRegIds = (registrations as any[])
      .filter((r) => (r.groupSize ?? 0) > 1)
      .map((r) => r.id);
    const allSeats = groupRegIds.length
      ? await this.prisma.groupSeat.findMany({
          where: { registrationId: { in: groupRegIds } },
          orderBy: [{ registrationId: 'asc' }, { seatIndex: 'asc' }],
          include: {
            claimedBy: {
              select: {
                fullName: true,
                username: true,
                mobileNumber: true,
                identities: { select: { email: true }, take: 1 },
              },
            },
          },
        })
      : [];
    const seatsByReg = new Map<string, typeof allSeats>();
    for (const s of allSeats) {
      const list = seatsByReg.get(s.registrationId) ?? [];
      list.push(s);
      seatsByReg.set(s.registrationId, list);
    }

    const seatStatusLabel = (status: string) =>
      status.charAt(0) + status.slice(1).toLowerCase(); // OPEN → Open

    // A GROUP registration is a single row whose `user` is only the team lead;
    // the whole team lives in seat rows (or legacy `groupMembers` JSON). Expand
    // each such registration into one row per seat/member so no attendee is
    // hidden. To keep the Amount column summable, the payment amount is
    // attributed to seat 1 (the lead) only.
    const rows: string[][] = [];
    for (const reg of registrations as any[]) {
      const responses = (reg.formResponses ?? {}) as Record<string, unknown>;
      const members: any[] = Array.isArray(reg.groupMembers)
        ? reg.groupMembers
        : [];
      const seats = seatsByReg.get(reg.id) ?? [];
      const isGroup =
        (reg.groupSize ?? 0) > 1 && (seats.length > 0 || members.length > 0);

      if (isGroup && seats.length > 0) {
        // Preferred path: one row per seat, with claim status.
        for (const seat of seats) {
          const md = (seat.memberDetails ?? {}) as any;
          const flat = flattenMember(md);
          const custom = (md?.customFields ?? {}) as Record<string, unknown>;
          const isLead = seat.seatIndex === 1;
          const claimer = seat.claimedBy;
          const label = isLead ? 'Lead' : seatStatusLabel(seat.status);
          rows.push([
            pickMemberField(flat, MEMBER_ALIASES.name) ||
              claimer?.fullName ||
              (isLead ? reg.user.fullName || '' : ''),
            claimer?.username || (isLead ? reg.user.username || '' : ''),
            pickMemberField(flat, MEMBER_ALIASES.email) ||
              claimer?.identities?.[0]?.email ||
              (isLead ? reg.user.identities?.[0]?.email || '' : ''),
            pickMemberField(flat, MEMBER_ALIASES.mobile) ||
              claimer?.mobileNumber ||
              (isLead ? reg.user.mobileNumber || '' : ''),
            reg.ticketType?.name || 'RSVP',
            '1',
            reg.status,
            reg.paymentStatus,
            isLead ? Number(reg.totalAmount).toString() : '0',
            reg.registeredAt.toISOString(),
            reg.checkedInAt ? 'Yes' : 'No',
            `Group of ${reg.groupSize} · Seat ${seat.seatIndex} · ${label}`,
            ...formFields.map((f) =>
              formatResponse(custom[f.id] ?? (isLead ? responses[f.id] : undefined)),
            ),
          ]);
        }
      } else if (isGroup) {
        members.forEach((m, i) => {
          const flat = flattenMember(m);
          const custom = (m?.customFields ?? {}) as Record<string, unknown>;
          // The lead (index 0) is a real user, so fall back to their account
          // details when the stored member entry is blank (legacy rosters).
          const leadName = i === 0 ? reg.user.fullName || '' : '';
          const leadEmail = i === 0 ? reg.user.identities?.[0]?.email || '' : '';
          const leadMobile = i === 0 ? reg.user.mobileNumber || '' : '';
          rows.push([
            pickMemberField(flat, MEMBER_ALIASES.name) || leadName,
            i === 0 ? reg.user.username || '' : '',
            pickMemberField(flat, MEMBER_ALIASES.email) || leadEmail,
            pickMemberField(flat, MEMBER_ALIASES.mobile) || leadMobile,
            reg.ticketType?.name || 'RSVP',
            '1',
            reg.status,
            reg.paymentStatus,
            i === 0 ? Number(reg.totalAmount).toString() : '0',
            reg.registeredAt.toISOString(),
            reg.checkedInAt ? 'Yes' : 'No',
            `Group of ${reg.groupSize} · ${i === 0 ? 'Lead' : `Member ${i + 1}`}`,
            // Custom answers: prefer the member's own, fall back to the shared
            // registration responses for the lead row.
            ...formFields.map((f) =>
              formatResponse(custom[f.id] ?? (i === 0 ? responses[f.id] : undefined)),
            ),
          ]);
        });
      } else {
        rows.push([
          reg.user.fullName || '',
          reg.user.username || '',
          reg.user.identities?.[0]?.email || '',
          reg.user.mobileNumber || '',
          reg.ticketType?.name || 'RSVP',
          reg.quantity.toString(),
          reg.status,
          reg.paymentStatus,
          Number(reg.totalAmount).toString(),
          reg.registeredAt.toISOString(),
          reg.checkedInAt ? 'Yes' : 'No',
          '',
          ...formFields.map((f) => formatResponse(responses[f.id])),
        ]);
      }
    }

    const file = await buildExportFile(
      format,
      `${event.title} — Attendees`,
      header,
      rows,
    );

    return {
      buffer: file.buffer,
      contentType: file.contentType,
      filename: `${event.slug}-attendees.${file.extension}`,
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

    if (!(await isSpaceAdmin(this.prisma, userId, event.spaceId))) {
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
  private async buildRegistrationDetail(
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

  /** Assert the user is a Space Admin of the event's space. */
  private async assertEventOrganiser(userId: string, eventId: string) {
    await assertEventSpaceAdmin(this.prisma, userId, eventId, 'Unauthorized');
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

  /**
   * Core transfer — reassigns a registration's holder. NO authorisation here;
   * callers gate it (admin-direct, or an approved organiser request). The same
   * ticket, QR code, payment record and group roster move across untouched;
   * only who the registration belongs to changes.
   *
   * The target must already have a Unifesto account (an email identity): a
   * ticket can only be handed to someone who can sign in and see it. And they
   * must not already hold a registration for this event's same ticket type,
   * which the `@@unique([eventId, userId, ticketTypeId])` constraint forbids —
   * we check first so the caller gets a clear message, not a raw DB error.
   */
  private async performTransfer(
    registration: { id: string; eventId: string; userId: string; ticketTypeId: string | null },
    email: string,
  ) {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      throw new BadRequestException('An email is required');
    }

    // Resolve the target account from its email identity. Case-insensitive, and
    // preferring the account's primary identity when an email appears more than
    // once (e.g. linked via both email and Google).
    const identity = await this.prisma.userIdentity.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      orderBy: { isPrimary: 'desc' },
      select: { userId: true },
    });
    if (!identity) {
      throw new NotFoundException(
        'No Unifesto account uses that email. Ask them to sign in to the app once, then transfer the ticket.',
      );
    }

    if (identity.userId === registration.userId) {
      throw new BadRequestException(
        'This registration already belongs to that account.',
      );
    }

    const clash = await this.prisma.eventRegistration.findFirst({
      where: {
        eventId: registration.eventId,
        userId: identity.userId,
        ticketTypeId: registration.ticketTypeId,
      },
    });
    if (clash) {
      throw new ConflictException(
        'That account already has a registration for this event.',
      );
    }

    const updated = await this.prisma.eventRegistration.update({
      where: { id: registration.id },
      data: { userId: identity.userId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            mobileNumber: true,
            identities: { select: { email: true }, take: 1 },
          },
        },
        ticketType: { select: { id: true, name: true } },
      },
    });

    const { identities, ...newUser } = updated.user as any;
    return {
      ...updated,
      user: { ...newUser, email: identities?.[0]?.email || null },
    };
  }

  /** Admin transfers a registration directly, no request needed. */
  async adminTransferRegistration(
    eventId: string,
    registrationId: string,
    email: string,
  ) {
    const registration = await this.prisma.eventRegistration.findFirst({
      where: { id: registrationId, eventId },
      select: { id: true, eventId: true, userId: true, ticketTypeId: true },
    });
    if (!registration) throw new NotFoundException('Registration not found');
    return this.performTransfer(registration, email);
  }

  /**
   * Organiser raises a transfer request for an admin to review. Organisers
   * cannot move tickets themselves — this only records the ask.
   */
  async requestRegistrationTransfer(
    userId: string,
    eventId: string,
    registrationId: string,
    email: string,
    reason?: string,
  ) {
    await this.assertEventOrganiser(userId, eventId);

    const registration = await this.prisma.eventRegistration.findFirst({
      where: { id: registrationId, eventId },
      select: { id: true },
    });
    if (!registration) throw new NotFoundException('Registration not found');

    if (!email.trim()) throw new BadRequestException('An email is required');

    const existing = await this.prisma.registrationTransferRequest.findFirst({
      where: { registrationId, status: 'PENDING' },
    });
    if (existing) {
      throw new ConflictException(
        'A transfer request for this registration is already awaiting review',
      );
    }

    return this.prisma.registrationTransferRequest.create({
      data: {
        registrationId,
        requestedBy: userId,
        targetEmail: email.trim(),
        reason: reason ?? null,
        status: 'PENDING',
      },
      include: this.transferRequestInclude(),
    });
  }

  /** Transfer requests raised by this organiser. */
  async getMyTransferRequests(userId: string) {
    return this.prisma.registrationTransferRequest.findMany({
      where: { requestedBy: userId },
      include: this.transferRequestInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Admin inbox of transfer requests. */
  async getAllTransferRequests(status?: string, page = 1, limit = 20) {
    const where = status ? { status } : {};
    const [requests, total] = await Promise.all([
      this.prisma.registrationTransferRequest.findMany({
        where,
        include: this.transferRequestInclude(),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.registrationTransferRequest.count({ where }),
    ]);
    return {
      requests,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Admin decision. Approving performs the transfer to `overrideEmail` if the
   * admin adjusted it, otherwise to the requested email — so the admin stays in
   * full control of the outcome.
   */
  async reviewTransferRequest(
    requestId: string,
    adminId: string,
    status: 'APPROVED' | 'REJECTED',
    reviewNote?: string,
    overrideEmail?: string,
  ) {
    const req = await this.prisma.registrationTransferRequest.findUnique({
      where: { id: requestId },
      include: {
        registration: {
          select: { id: true, eventId: true, userId: true, ticketTypeId: true },
        },
      },
    });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== 'PENDING') {
      throw new BadRequestException('This request has already been reviewed');
    }

    if (status === 'APPROVED') {
      // Perform the transfer first: if it fails (unknown email, clash), the
      // request stays PENDING so the admin can retry rather than being left
      // APPROVED with nothing moved.
      await this.performTransfer(
        req.registration,
        overrideEmail?.trim() || req.targetEmail,
      );
    }

    return this.prisma.registrationTransferRequest.update({
      where: { id: requestId },
      data: {
        status,
        reviewNote: reviewNote ?? null,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        ...(overrideEmail?.trim() ? { targetEmail: overrideEmail.trim() } : {}),
      },
      include: this.transferRequestInclude(),
    });
  }

  private transferRequestInclude() {
    return {
      registration: {
        select: {
          id: true,
          groupSize: true,
          event: { select: { id: true, title: true, slug: true, spaceId: true } },
          ticketType: { select: { id: true, name: true } },
          user: {
            select: {
              id: true,
              fullName: true,
              username: true,
              identities: { select: { email: true }, take: 1 },
            },
          },
        },
      },
      requester: { select: { id: true, fullName: true, username: true } },
    };
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
   * (matched by their email in `groupMembers`), not the lead. Lets a member see
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

    // JSONB @> containment matches a member object that *contains* {email},
    // even though it also has name/mobile/etc. Case-sensitive, so emails must
    // match as stored (both are normally lowercase).
    const matchers = emails.map(
      (e) =>
        Prisma.sql`r.group_members @> ${JSON.stringify([{ email: e }])}::jsonb`,
    );
    // Legacy JSON roster match needs an email; claimed seats (below) don't.
    const idRows = emails.length === 0 ? [] : await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT r.id FROM event_registrations r
      WHERE r.payment_status IN ('PAID', 'PARTIALLY_REFUNDED')
        AND r.status <> 'CANCELLED'
        AND r.user_id <> ${userId}::uuid
        AND (${Prisma.join(matchers, ' OR ')})
    `);
    // Seats I claimed from an invite live on GroupSeat (not the legacy JSON),
    // so they're matched by claimer, not email.
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

  /**
   * Create payment order for paid event registration
   */
  /**
   * Starts checkout for a ticket. Returns a `WaitlistJoinResponseDto` instead
   * of an order when the ticket has sold out and offers a waiting list, so
   * callers must check `isWaitlisted` before opening a payment sheet.
   */
  async createPaymentOrder(
    eventId: string,
    userId: string,
    dto: CreateOrderDto,
  ): Promise<OrderResponseDto | WaitlistJoinResponseDto> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        space: {
          include: { subscription: true },
        },
        ticketTypes: true,
        registrations: {
          where: { userId },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }
    await this.assertMayRegister(event, userId);

    if (event.status !== 'PUBLISHED') {
      throw new BadRequestException('Event is not open for registration');
    }

    // A recurring series parent is a non-registerable template.
    if (event.isRecurring) {
      throw new BadRequestException(
        'This is a recurring series; register for a specific occurrence instead.',
      );
    }

    // Organiser-configured restriction: reject if the user already holds a
    // ticket that blocks the requested one.
    await this.assertTicketNotBlocked(userId, eventId, dto.ticketTypeId);

    // Answer policy, same as free registration (see registerForEvent).
    const formTicket = event.ticketTypes.find((t) => t.id === dto.ticketTypeId);
    dto.formResponses = await enforceFormAnswers(this.prisma, {
      eventId,
      ticketTypeId: dto.ticketTypeId,
      isGroup: formTicket?.kind === 'GROUP',
      formResponses: dto.formResponses,
      members: dto.groupMembers,
      required: { team: true, members: 'first' },
      uploaderIds: [userId],
    });

    // At most one ACTIVE registration may exist per (event, user, ticket type)
    // — enforced by the partial unique index (migration
    // 20260815120000_registration_active_partial_unique), which exempts
    // REFUNDED and CANCELLED rows. So a user may hold historical refunded /
    // cancelled rows for this ticket type alongside at most one live one; the
    // cleanup below must mirror that predicate exactly.
    const sameTypeRegs = event.registrations.filter(
      (r) => r.ticketTypeId === dto.ticketTypeId,
    );

    // Block only when a live ticket is still held — fully PAID, or partially
    // refunded (they keep the seat), and not cancelled.
    const activeReg = sameTypeRegs.find(
      (r) =>
        r.status !== RegistrationStatus.CANCELLED &&
        (r.paymentStatus === PaymentStatus.PAID ||
          r.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED),
    );
    if (activeReg) {
      throw new BadRequestException(
        'You already have a ticket of this type for this event',
      );
    }

    // Clear abandoned attempts that never settled money (PENDING / FAILED) so a
    // fresh registration can be created — these ARE covered by the partial
    // index and would otherwise collide. REFUNDED / CANCELLED rows are left
    // untouched as financial history; the partial index lets the new row
    // coexist with them, which is what makes re-registration after a refund
    // work without deleting the refund's ledger.
    const abandonedRegs = sameTypeRegs.filter(
      (r) =>
        r.paymentStatus === PaymentStatus.PENDING ||
        r.paymentStatus === PaymentStatus.FAILED,
    );
    for (const stale of abandonedRegs) {
      // Release any coupon slot this abandoned attempt was holding BEFORE the
      // delete. The FK cascade would remove the redemption row but never
      // decrement the coupon's usedCount, so deleting first would leak the slot.
      // Both steps run in one transaction so the slot and the row go together.
      await this.prisma.$transaction(async (tx) => {
        await this.coupons.releaseByRegistration(tx, stale.id);
        await tx.eventRegistration.delete({ where: { id: stale.id } });
      });
    }

    // Get and validate ticket type
    const ticketType = event.ticketTypes.find((t) => t.id === dto.ticketTypeId);
    if (!ticketType) {
      throw new NotFoundException('Ticket type not found');
    }

    if (!ticketType.isActive || !ticketType.isVisible) {
      throw new BadRequestException('Ticket type not available');
    }

    this.assertTicketOnSale(ticketType);

    // Seats this booking will occupy — a group takes groupSize seats, not 1.
    const plannedSeats =
      ticketType.kind === 'GROUP'
        ? dto.groupSize ?? ticketType.minGroupSize ?? 1
        : dto.quantity;

    // Check availability
    // null totalQuantity = unlimited capacity.
    if (
      ticketType.totalQuantity != null &&
      ticketType.soldCount + plannedSeats > ticketType.totalQuantity
    ) {
      // Paid tickets reach checkout through here, so the waiting list fallback
      // has to exist on this path too — without it, a sold-out paid ticket is
      // a dead end no matter what the organiser configured.
      if (ticketType.waitlistEnabled) {
        return this.addToWaitlist(userId, eventId, {
          ticketTypeId: dto.ticketTypeId,
          quantity: dto.quantity,
          groupSize: dto.groupSize,
          groupMembers: dto.groupMembers,
          formResponses: dto.formResponses,
        });
      }
      throw new BadRequestException('Not enough tickets available');
    }

    if (dto.quantity > ticketType.perUserLimit) {
      throw new BadRequestException(
        `Maximum ${ticketType.perUserLimit} tickets per user`,
      );
    }

    // Calculate amounts — GROUP tickets price per-group or per-person.
    let groupSize: number | null = null;
    let baseAmount: number;
    if (ticketType.kind === 'GROUP') {
      const size: number = dto.groupSize ?? ticketType.minGroupSize ?? 1;
      if (
        (ticketType.minGroupSize != null && size < ticketType.minGroupSize) ||
        (ticketType.maxGroupSize != null && size > ticketType.maxGroupSize)
      ) {
        throw new BadRequestException(
          `Group size must be between ${ticketType.minGroupSize} and ${ticketType.maxGroupSize}`,
        );
      }
      groupSize = size;
      this.assertGroupMembersComplete(dto.groupMembers, size);
      baseAmount =
        ticketType.groupPricingMode === 'PER_PERSON'
          ? Number(ticketType.price) * size
          : Number(ticketType.price);
    } else {
      baseAmount = Number(ticketType.price) * dto.quantity;
    }

    // Resolve an optional discount code. resolveDiscount runs every eligibility
    // check and throws a buyer-readable BadRequest if the code does not apply —
    // no slot is held yet. The hard reservation happens atomically when the
    // registration is actually created, below. The discount comes off the base
    // only; the processing fee is then computed on the discounted base, so a
    // coupon never touches gateway economics.
    let couponCtx: ResolvedDiscount | null = null;
    let couponDiscount = 0;
    if (dto.couponCode?.trim()) {
      couponCtx = await this.coupons.resolveDiscount({
        eventId,
        userId,
        ticketTypeId: dto.ticketTypeId,
        baseAmount,
        code: dto.couponCode,
      });
      couponDiscount = couponCtx.discount;
      baseAmount = Math.max(0, baseAmount - couponDiscount);
    }

    const processingFee = this.payments.computeProcessingFee(baseAmount);
    const totalAmount = baseAmount + processingFee;

    // The full total is paid via Razorpay (the processing fee is never waived).
    const razorpayAmount = totalAmount;

    // Free ticket with no processing fee owed — complete immediately, no Razorpay order needed.
    if (razorpayAmount === 0) {
      const qrCode = this.generateQRCode();
      const registration = await this.prisma.$transaction(async (tx) => {
        const reg = await tx.eventRegistration.create({
          data: {
            eventId,
            userId,
            ticketTypeId: dto.ticketTypeId,
            quantity: dto.quantity,
            groupSize,
            groupMembers:
          (dto.groupMembers as unknown as Prisma.InputJsonValue) ?? undefined,
            totalAmount: new Prisma.Decimal(totalAmount),
            razorpayAmount: new Prisma.Decimal(0),
            processingFee: new Prisma.Decimal(processingFee),
            couponId: couponCtx?.coupon.id ?? null,
            couponDiscount: new Prisma.Decimal(couponDiscount),
            paymentStatus: PaymentStatus.PAID,
            status: RegistrationStatus.REGISTERED,
            paidAt: new Date(),
            qrCode,
            formResponses: dto.formResponses || {},
            ...utmColumns(dto),
          },
        });

        // A coupon can zero a paid ticket (100% off / flat >= price). This path
        // completes immediately, so reserve the slot and record the redemption
        // as CONFIRMED in the same transaction. reserveSlot is the atomic cap
        // gate — if the coupon just filled, roll back with a clear message.
        if (couponCtx) {
          const reserved = await this.coupons.reserveSlot(tx, couponCtx.coupon.id);
          if (!reserved) {
            throw new BadRequestException(
              'That discount code has just reached its usage limit',
            );
          }
          await this.coupons.writeRedemption(tx, {
            couponId: couponCtx.coupon.id,
            registrationId: reg.id,
            userId,
            discount: couponDiscount,
            status: CouponRedemptionStatus.CONFIRMED,
          });
        }

        const seats = this.seatsFor(reg);
        await tx.event.update({
          where: { id: eventId },
          data: { registeredCount: { increment: seats } },
        });

        await tx.eventTicketType.update({
          where: { id: dto.ticketTypeId },
          data: { soldCount: { increment: seats } },
        });

        for (let i = 0; i < dto.quantity; i++) {
          await tx.eventTicket.create({
            data: {
              registrationId: reg.id,
              ticketCode: this.generateTicketCode(),
              qrCode: this.generateQRCode(),
            },
          });
        }

        return reg;
      });

      // Fetch full registration with user and event for notifications
      const fullRegistration = await this.prisma.eventRegistration.findUnique({
        where: { id: registration.id },
        include: {
          user: true,
          // space.name feeds the calendar (.ics) ORGANIZER line.
          event: {
          include: {
            space: {
              select: { name: true },
            },
          },
        },
        },
      });

      // Send WhatsApp notification (non-blocking)
      try {
        if (fullRegistration?.user?.mobileNumber) {
          const evDate = this.formatEventDate(fullRegistration.event.startDateTime);
          const evTime = this.formatEventTime(
            fullRegistration.event.startDateTime,
            fullRegistration.event.endDateTime,
          );
          await this.whatsappService.sendRegistrationConfirmation(
            fullRegistration.user.mobileNumber,
            {
              userName: fullRegistration.user.fullName || fullRegistration.user.username || 'there',
              eventTitle: fullRegistration.event.title,
              eventDate: evDate,
              eventTime: evTime,
              venueName: fullRegistration.event.venueName || undefined,
              city: fullRegistration.event.city || undefined,
              isOnline: fullRegistration.event.type === 'ONLINE',
              onlineUrl: fullRegistration.event.onlineUrl || undefined,
            },
          );
        }
      } catch (error) {
        this.logger.error('Failed to send free-ticket WhatsApp notification', error);
      }

      // Send email notification (non-blocking)
      const identity = await this.prisma.userIdentity.findFirst({
        where: { userId, email: { not: null }, isPrimary: true },
        select: { email: true },
      });

      if (identity?.email && fullRegistration) {
        const evDate = this.formatEventDate(fullRegistration.event.startDateTime);
        const evTime = this.formatEventTime(
          fullRegistration.event.startDateTime,
          fullRegistration.event.endDateTime,
        );

        this.emailService.sendRegistrationConfirmation({
          email: identity.email,
          userName: fullRegistration.user.fullName || fullRegistration.user.username || 'there',
          eventId: fullRegistration.event.id,
          eventTitle: fullRegistration.event.title,
          eventDate: evDate,
          eventTime: evTime,
          venueName: fullRegistration.event.venueName || undefined,
          city: fullRegistration.event.city || undefined,
          isOnline: fullRegistration.event.type === 'ONLINE',
          onlineUrl: fullRegistration.event.onlineUrl || undefined,
          qrCode: fullRegistration.qrCode,
          ticketCode: undefined,
          // Raw fields for the "Add to calendar" .ics attachment.
          eventSlug: fullRegistration.event.slug,
          eventStartDateTime: fullRegistration.event.startDateTime,
          eventEndDateTime: fullRegistration.event.endDateTime,
          eventTimezone: fullRegistration.event.timezone,
          eventType: fullRegistration.event.type,
          venueAddress: fullRegistration.event.venueAddress || undefined,
          eventDescription: fullRegistration.event.description || undefined,
          organiserName: fullRegistration.event.space?.name || undefined,
        }).catch((err) => this.logger.error('Failed to send free-ticket confirmation email', err));
      }

      return {
        registrationId: registration.id,
        razorpayOrderId: null,
        razorpayKeyId: null,
        amount: 0,
        currency: 'INR',
        breakdown: {
          baseAmount,
          couponDiscount,
          couponCode: couponCtx?.coupon.code,
          processingFee,
          razorpayAmount: 0,
          totalAmount,
        },
      };
    }

    // Create pending registration.
    //
    // The cleanup above removes any resolvable leftover, but two near-
    // simultaneous requests (a double-click on "Pay") can both clear and then
    // race into this create() against the (eventId, userId, ticketTypeId)
    // unique key. Translate that residual collision into a clean 409 rather
    // than letting the raw Prisma P2002 escape as a 500.
    const qrCode = this.generateQRCode();
    let registration: EventRegistration;
    try {
      // Reg create + coupon reservation commit together: the slot is held
      // atomically with the pending registration, so a checkout that starts
      // holds one slot and no more. The reservation is released later if this
      // pending reg is abandoned, fails, or its TTL lapses (sweep).
      registration = await this.prisma.$transaction(async (tx) => {
        const reg = await tx.eventRegistration.create({
          data: {
            eventId,
            userId,
            ticketTypeId: dto.ticketTypeId,
            quantity: dto.quantity,
            groupSize,
            groupMembers:
              (dto.groupMembers as unknown as Prisma.InputJsonValue) ?? undefined,
            totalAmount: new Prisma.Decimal(totalAmount),
            razorpayAmount: new Prisma.Decimal(razorpayAmount),
            processingFee: new Prisma.Decimal(processingFee),
            couponId: couponCtx?.coupon.id ?? null,
            couponDiscount: new Prisma.Decimal(couponDiscount),
            paymentStatus: PaymentStatus.PENDING,
            status: RegistrationStatus.REGISTERED,
            qrCode,
            formResponses: dto.formResponses || {},
            ...utmColumns(dto),
          },
        });

        if (couponCtx) {
          const reserved = await this.coupons.reserveSlot(tx, couponCtx.coupon.id);
          if (!reserved) {
            throw new BadRequestException(
              'That discount code has just reached its usage limit',
            );
          }
          await this.coupons.writeRedemption(tx, {
            couponId: couponCtx.coupon.id,
            registrationId: reg.id,
            userId,
            discount: couponDiscount,
            status: CouponRedemptionStatus.RESERVED,
          });
        }

        return reg;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'A registration for this ticket is already in progress. Please wait a moment and try again.',
        );
      }
      throw err;
    }

    // Create Razorpay order
    const order = await this.payments.createOrder({
      amount: razorpayAmount,
      receipt: `reg_${registration.id}`,
      notes: {
        registrationId: registration.id,
        eventId,
        userId,
      },
    });

    // Update registration with order ID
    await this.prisma.eventRegistration.update({
      where: { id: registration.id },
      data: { orderId: order.orderId },
    });

    // Cache order mapping in Redis (TTL 24h). Razorpay retries a failed webhook
    // for up to 24h, so a short TTL forced late/retried captures onto the
    // fragile DB-by-orderId path; a day covers the retry window cheaply.
    const client = this.cache['redis'].getClient();
    if (client) {
      await client.set(`order:${order.orderId}`, registration.id, 'EX', 86400);
    }

    return {
      registrationId: registration.id,
      razorpayOrderId: order.orderId,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID!,
      amount: Math.round(razorpayAmount * 100), // in paise
      currency: 'INR',
      breakdown: {
        baseAmount,
        couponDiscount,
        couponCode: couponCtx?.coupon.code,
        processingFee,
        razorpayAmount,
        totalAmount,
      },
    };
  }

  /**
   * Creates the Razorpay order for an offered waiting list spot.
   *
   * Unlike `createPaymentOrder`, this charges the *existing* registration in
   * place. It must not delete and recreate the row the way the normal buy path
   * does: that row is the queue entry, carrying the join time that earned the
   * offer and the seat already held for it.
   *
   * The amount was fixed when the organiser made the offer, so a price change
   * since then does not move the goalposts on someone mid-payment.
   */
  async createWaitlistOfferOrder(
    userId: string,
    registrationId: string,
  ): Promise<OrderResponseDto> {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: { ticketType: true },
    });

    if (!registration) {
      throw new NotFoundException('Waiting list entry not found');
    }
    if (registration.userId !== userId) {
      throw new ForbiddenException('This is not your waiting list entry');
    }
    if (registration.waitlistStatus !== WaitlistStatus.OFFERED) {
      throw new BadRequestException(
        registration.waitlistStatus === WaitlistStatus.CONVERTED
          ? 'This spot is already confirmed'
          : 'You have not been offered a spot for this ticket yet',
      );
    }
    if (registration.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('This spot is already paid for');
    }
    if (
      registration.waitlistOfferExpiresAt &&
      registration.waitlistOfferExpiresAt < new Date()
    ) {
      throw new BadRequestException(
        'This offer has expired and the seat has been released',
      );
    }

    const razorpayAmount = Number(registration.razorpayAmount);
    if (razorpayAmount <= 0) {
      throw new BadRequestException('Nothing to pay for this spot');
    }

    const order = await this.payments.createOrder({
      amount: razorpayAmount,
      receipt: `wl_${registrationId}`.slice(0, 40),
      notes: {
        registrationId,
        userId,
        eventId: registration.eventId,
        source: 'waitlist_offer',
      },
    });

    await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: { orderId: order.orderId },
    });

    // Same Redis mapping the normal checkout uses, so the webhook can find this
    // registration if the client never returns to confirm. 24h TTL to cover
    // Razorpay's webhook-retry window (see the main checkout for why).
    const client = this.cache['redis'].getClient();
    if (client) {
      await client.set(`order:${order.orderId}`, registrationId, 'EX', 86400);
    }

    const processingFee = Number(registration.processingFee);
    return {
      registrationId,
      razorpayOrderId: order.orderId,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID!,
      amount: Math.round(razorpayAmount * 100), // paise
      currency: 'INR',
      breakdown: {
        baseAmount: Number(registration.totalAmount) - processingFee,
        // Coupons are not offered on a waiting-list claim — the seat price is
        // whatever was captured when the offer was made.
        couponDiscount: 0,
        processingFee,
        razorpayAmount,
        totalAmount: Number(registration.totalAmount),
      },
    };
  }

  /**
   * Verify Razorpay payment and complete registration
   */
  async verifyPayment(
    eventId: string,
    userId: string,
    dto: VerifyPaymentDto,
  ): Promise<RegistrationResponseDto> {
    // Verify HMAC signature
    if (
      !this.payments.verifyPaymentSignature(
        dto.razorpayOrderId,
        dto.razorpayPaymentId,
        dto.razorpaySignature,
      )
    ) {
      throw new BadRequestException('Invalid payment signature');
    }

    // Get pending registration
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: dto.registrationId },
      include: {
        event: {
          include: {
            space: true,
          },
        },
        user: true,
      },
    });

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    if (registration.userId !== userId) {
      throw new BadRequestException('Unauthorized');
    }

    // The Razorpay webhook (`payment.captured`) and this client-side verify
    // call race to confirm the same payment. When the webhook wins, the row is
    // already PAID by the time the browser's verify arrives — that is success,
    // not an error. The HMAC signature check above already proved this is a
    // genuine Razorpay payment, so return the confirmed registration
    // idempotently instead of surfacing a scary "Payment already completed"
    // 400 to someone who in fact paid successfully.
    if (registration.paymentStatus === PaymentStatus.PAID) {
      const tickets = await this.prisma.eventTicket.findMany({
        where: { registrationId: registration.id },
      });
      this.logger.log(
        `verifyPayment: registration ${registration.id} already PAID ` +
          `(likely completed by the webhook first) — returning success idempotently`,
      );
      return {
        registrationId: registration.id,
        message: 'Payment verified, registration complete',
        qrCode: registration.qrCode,
        tickets,
      };
    }

    // A waiting list offer already claimed its seat when the organiser let the
    // person in, so this path must not claim it a second time. Conversion is
    // handled by the waiting list, which increments the attendee count only.
    if (registration.waitlistStatus === WaitlistStatus.OFFERED) {
      await this.waitlist.convert(registration.id, {
        paymentId: dto.razorpayPaymentId,
        orderId: dto.razorpayOrderId,
      });

      await this.sendRegistrationConfirmations(registration.id);
      await this.cache.invalidateCheckinCache(eventId);
      await this.cache.incrementEventScore(eventId);


      const tickets = await this.prisma.eventTicket.findMany({
        where: { registrationId: registration.id },
      });

      this.logger.log(
        `Waiting list offer converted for registration ${registration.id}`,
      );

      return {
        registrationId: registration.id,
        message: 'Payment verified, your spot is confirmed',
        qrCode: registration.qrCode,
        tickets,
      };
    }

    // Complete registration in transaction. The client verify and the
    // `payment.captured` webhook race to confirm the same payment; both checked
    // `paymentStatus === PAID` above, but two that overlap across replicas both
    // passed that check with PENDING. The atomic updateMany below is the real
    // gate: only the caller whose conditional update actually changes a row
    // (count === 1) proceeds to increment seats and send confirmations. A loser
    // (count === 0) bails out and returns success idempotently — without it the
    // seat counts double and the attendee gets two confirmations.
    let claimedWin = false;
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.eventRegistration.updateMany({
        where: { id: registration.id, paymentStatus: { not: PaymentStatus.PAID } },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentId: dto.razorpayPaymentId,
          orderId: dto.razorpayOrderId,
          paidAt: new Date(),
        },
      });
      if (claimed.count === 0) return; // another path already completed this
      claimedWin = true;

      // Payment settled — promote a held coupon reservation to permanent. Runs
      // inside the same exactly-once guard as the seat increment, so a coupon is
      // confirmed once and only for the caller that won the race. No-op when the
      // registration carried no coupon.
      await this.coupons.confirmByRegistration(tx, registration.id);

      // Increment counts — a group occupies groupSize seats, not 1.
      const seats = this.seatsFor(registration);
      if (registration.ticketTypeId) {
        await tx.eventTicketType.update({
          where: { id: registration.ticketTypeId },
          data: { soldCount: { increment: seats } },
        });
      }

      // Increment event registeredCount
      await tx.event.update({
        where: { id: eventId },
        data: { registeredCount: { increment: seats } },
      });

      // Generate QR codes for each ticket
      for (let i = 0; i < registration.quantity; i++) {
        await tx.eventTicket.create({
          data: {
            registrationId: registration.id,
            ticketCode: this.generateTicketCode(),
            qrCode: this.generateQRCode(),
          },
        });
      }

      // Group registration → per-seat rows (fast-registration Part 2). Same
      // transaction as the availability increment, so seats and `seats` count
      // commit together.
      await this.groupSeats.createSeatsForRegistration(tx, {
        registrationId: registration.id,
        leadUserId: registration.userId,
        seatCount: seats,
        groupMembers: registration.groupMembers as unknown[] | null,
      });
    });

    // Lost the race — the other path (webhook/verify) already completed this
    // registration. Return success idempotently and send nothing.
    if (!claimedWin) {
      const tickets = await this.prisma.eventTicket.findMany({
        where: { registrationId: registration.id },
      });
      this.logger.log(
        `verifyPayment: registration ${registration.id} completed concurrently ` +
          `by another path — returning success idempotently`,
      );
      return {
        registrationId: registration.id,
        message: 'Payment verified, registration complete',
        qrCode: registration.qrCode,
        tickets,
      };
    }

    // Get updated registration with tickets
    const updatedRegistration = await this.prisma.eventRegistration.findUnique({
      where: { id: registration.id },
      include: {
        tickets: true,
        event: true,
        user: {
          include: {
            identities: true,
          },
        },
      },
    });

    // Clear Redis order cache
    const client = this.cache['redis'].getClient();
    if (client) {
      await client.del(`order:${dto.razorpayOrderId}`);
    }

    // Send notifications (don't let failures break the flow)
    try {
      // WhatsApp notification
      if (registration.user.mobileNumber) {
        // Format dates for registration confirmation
        const eventDate = new Date(registration.event.startDateTime).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });
        const startTime = new Date(registration.event.startDateTime).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        const endTime = new Date(registration.event.endDateTime).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        await this.whatsappService.sendRegistrationConfirmation(
          registration.user.mobileNumber,
          {
            userName: registration.user.fullName || registration.user.username || 'there',
            eventTitle: registration.event.title,
            eventDate,
            eventTime: `${startTime} - ${endTime} IST`,
            venueName: registration.event.venueName || undefined,
            city: registration.event.city || undefined,
            isOnline: registration.event.type === 'ONLINE',
            onlineUrl: registration.event.onlineUrl || undefined,
          },
        );
      }

      // Email notifications (non-blocking)
      const userEmail = updatedRegistration?.user?.identities?.[0]?.email;
      if (userEmail) {
        const eventDate = this.formatEventDate(registration.event.startDateTime);
        const eventTime = this.formatEventTime(
          registration.event.startDateTime,
          registration.event.endDateTime,
        );

        // Send payment confirmation
        this.emailService.sendPaymentConfirmation({
          email: userEmail,
          userName: registration.user.fullName || registration.user.username || 'there',
          eventId: registration.event.id,
          eventTitle: registration.event.title,
          eventDate,
          eventTime,
          venueName: registration.event.venueName || undefined,
          city: registration.event.city || undefined,
          isOnline: registration.event.type === 'ONLINE',
          onlineUrl: registration.event.onlineUrl || undefined,
          amount: Number(registration.totalAmount) - Number(registration.processingFee),
          processingFee: Number(registration.processingFee),
          razorpayPaymentId: dto.razorpayPaymentId,
          ticketCode: updatedRegistration!.tickets[0]?.ticketCode || undefined,
          qrCode: registration.qrCode,
        }).catch(err => this.logger.error('Failed to send payment confirmation email', err));

        // Send registration confirmation
        this.emailService.sendRegistrationConfirmation({
          email: userEmail,
          userName: registration.user.fullName || registration.user.username || 'there',
          eventId: registration.event.id,
          eventTitle: registration.event.title,
          eventDate,
          eventTime,
          venueName: registration.event.venueName || undefined,
          city: registration.event.city || undefined,
          isOnline: registration.event.type === 'ONLINE',
          onlineUrl: registration.event.onlineUrl || undefined,
          qrCode: registration.qrCode,
          ticketCode: updatedRegistration!.tickets[0]?.ticketCode || undefined,
          // Raw fields for the "Add to calendar" .ics attachment.
          eventSlug: registration.event.slug,
          eventStartDateTime: registration.event.startDateTime,
          eventEndDateTime: registration.event.endDateTime,
          eventTimezone: registration.event.timezone,
          eventType: registration.event.type,
          venueAddress: registration.event.venueAddress || undefined,
          eventDescription: registration.event.description || undefined,
          organiserName: registration.event.space?.name || undefined,
        }).catch(err => this.logger.error('Failed to send registration confirmation email', err));
      }

      // Email the shared ticket to each group member (skips the lead + dupes).
      await this.sendGroupMemberConfirmations(
        updatedRegistration,
        registration.event,
        registration.qrCode,
        updatedRegistration!.tickets[0]?.ticketCode || undefined,
        userEmail ?? null,
      );
    } catch (error) {
      this.logger.error('Failed to send notification after payment', error);
    }

    // Invalidate check-in cache
    await this.cache.invalidateCheckinCache(eventId);

    // Increment trending events score
    await this.cache.incrementEventScore(eventId);

    this.logger.log(`Payment verified for registration ${registration.id}`);


    return {
      registrationId: registration.id,
      message: 'Payment verified, registration complete',
      qrCode: registration.qrCode,
      tickets: updatedRegistration!.tickets,
    };
  }

  /**
   * Handle Razorpay webhook events
   */
  /**
   * Find the event registration a captured order belongs to, robustly, in
   * priority order:
   *   1. Redis `order:{orderId}` — the fast path (short TTL).
   *   2. A registration whose current `orderId` matches.
   *   3. The order's `notes.registrationId` (payload notes first, else fetched
   *      from Razorpay) — the DURABLE identifier that survives payment retries.
   *
   * Steps 1–2 both key on the *current* orderId, which a retry overwrites: when
   * an attendee pays, abandons, then retries, the captured payment sits on the
   * earlier order while `registration.orderId` now points at the new one — so a
   * late webhook (after the Redis TTL) found nothing and the money went
   * unrecorded. Step 3 closes that gap because order notes never change.
   */
  private async resolveRegistrationIdForOrder(
    orderId: string,
    paymentData: { notes?: Record<string, string> },
  ): Promise<string | null> {
    const client = this.cache['redis'].getClient();
    const cached = client ? await client.get(`order:${orderId}`) : null;
    if (cached) return cached;

    const byOrder = await this.prisma.eventRegistration.findFirst({
      where: { orderId },
      select: { id: true },
    });
    if (byOrder) return byOrder.id;

    // Durable fallback via order notes. Payment notes rarely carry them (they're
    // set on the order, not copied to the payment), so fetch the order's notes.
    let notesRegId = paymentData.notes?.registrationId as string | undefined;
    if (!notesRegId) {
      try {
        const notes = await this.payments.fetchOrderNotes(orderId);
        notesRegId = notes?.registrationId;
      } catch (err) {
        this.logger.warn(`Could not fetch order notes for ${orderId}: ${err}`);
      }
    }
    if (notesRegId) {
      const exists = await this.prisma.eventRegistration.findUnique({
        where: { id: notesRegId },
        select: { id: true },
      });
      if (exists) {
        this.logger.warn(
          `Resolved order ${orderId} to registration ${notesRegId} via order notes (its orderId was overwritten by a retry)`,
        );
        return exists.id;
      }
    }
    return null;
  }

  async handleRazorpayWebhook(rawBody: string, signature: string) {
    // Verify the signature against the exact bytes Razorpay signed. Parsing the
    // payload only *after* the check means we act on the same bytes we verified.
    if (
      !signature ||
      !rawBody ||
      !this.payments.verifyWebhookSignature(rawBody, signature)
    ) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;
    const paymentData = payload.payload.payment.entity;

    if (event === 'payment.captured') {
      const orderId = paymentData.order_id;
      const paymentId = paymentData.id;

      const registrationId = await this.resolveRegistrationIdForOrder(
        orderId,
        paymentData,
      );

      if (!registrationId) {
        // A Unifesto Stay payment rides the same account-wide webhook; its
        // order notes carry `stayBookingId` instead of `registrationId`.
        if (await this.stayBookings.completeFromWebhook(orderId, paymentId, paymentData.notes)) {
          return { received: true };
        }
        // Extra seats bought for a group carry `groupSeatPurchaseId`.
        if (await this.teamChanges.completeFromWebhook(orderId, paymentId, paymentData.notes)) {
          return { received: true };
        }
        // Money was captured at Razorpay but we can't tie it to a registration.
        // Distinguish a session capture (a different, client-verify-only flow —
        // this account-wide webhook still receives them) from a true orphan, so
        // the log points at the right place instead of a bare "not found".
        const session = await this.prisma.sessionRegistration.findFirst({
          where: { orderId },
          select: { id: true },
        });
        if (session) {
          this.logger.warn(
            `payment.captured for SESSION order ${orderId} (payment ${paymentId}) — sessions verify client-side, not via this webhook. Session ${session.id} left as-is.`,
          );
        } else {
          this.logger.error(
            `payment.captured: no registration for order ${orderId} (payment ${paymentId}) — captured money is unrecorded. Reconcile via the dashboard.`,
          );
        }
        return { received: true };
      }

      const registration = await this.prisma.eventRegistration.findUnique({
        where: { id: registrationId },
        select: { id: true, paymentStatus: true },
      });
      if (!registration) {
        this.logger.error(
          `payment.captured resolved registration ${registrationId} but it no longer exists (order ${orderId})`,
        );
        return { received: true };
      }
      if (registration.paymentStatus === PaymentStatus.PAID) {
        this.logger.log(`Registration ${registrationId} already paid — webhook idempotent`);
        return { received: true };
      }

      // Complete whenever not already PAID. A capture is authoritative: even a
      // row an earlier `payment.failed` marked FAILED must be revived, since the
      // money did in fact arrive.
      await this.completeWebhookPayment(registrationId, paymentId, orderId);
    } else if (event === 'payment.failed') {
      const orderId = paymentData.order_id;

      const registration = await this.prisma.eventRegistration.findFirst({
        where: { orderId },
        include: {
          event: true,
          user: {
            include: {
              identities: { where: { email: { not: null } }, select: { email: true }, take: 1 },
            },
          },
        },
      });

      if (registration && registration.paymentStatus === PaymentStatus.PENDING) {
        await this.markRegistrationFailed(registration);
      }
    }

    return { received: true };
  }

  /**
   * Mark a PENDING registration as FAILED and email the payer. Shared by the
   * `payment.failed` webhook and admin reconciliation so both paths behave
   * identically. Caller must have already confirmed the row is still PENDING.
   */
  private async markRegistrationFailed(registration: {
    id: string;
    razorpayAmount: Prisma.Decimal;
    event: { id: string; title: string; slug: string };
    user: {
      fullName: string | null;
      username: string | null;
      identities: { email: string | null }[];
    };
  }): Promise<void> {
    await this.prisma.eventRegistration.update({
      where: { id: registration.id },
      data: { paymentStatus: PaymentStatus.FAILED },
    });

    this.logger.log(`Payment failed for registration ${registration.id}`);

    // Send payment failed email (non-blocking)
    const userEmail = registration.user.identities[0]?.email;
    if (userEmail) {
      this.emailService
        .sendPaymentFailed({
          email: userEmail,
          userName: registration.user.fullName || registration.user.username || 'there',
          eventId: registration.event.id,
          eventTitle: registration.event.title,
          amount: Number(registration.razorpayAmount),
          reason: 'Payment was declined. Please try again.',
          retryUrl: `https://unifesto.app/event/${registration.event.slug}`,
        })
        .catch((err) => this.logger.error('Failed to send payment failed email', err));
    }
  }

  /**
   * Reconcile a stuck PENDING registration against Razorpay's own record of the
   * order — the backstop when neither the client verify nor the webhook settled
   * it. Fetches every payment attempt on the order and applies the truth:
   *   - a captured payment  → mark PAID (full seat/ticket settlement)
   *   - only failed attempts → mark FAILED
   *   - still in progress / no attempt → leave PENDING
   * Idempotent and safe to re-run; already-settled rows are returned unchanged.
   */
  async reconcilePendingPayment(
    registrationId: string,
    opts?: { paymentId?: string; reassignOrphan?: boolean; allowAmountMismatch?: boolean },
  ) {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: {
        event: true,
        user: {
          include: {
            identities: { where: { email: { not: null } }, select: { email: true }, take: 1 },
          },
        },
      },
    });
    if (!registration) throw new NotFoundException('Registration not found');

    const previousStatus = registration.paymentStatus;
    const unchanged = (detail: string) => ({
      registrationId,
      previousStatus,
      newStatus: previousStatus,
      changed: false,
      detail,
    });

    // A registration is reconcilable only while its money is unsettled. PENDING
    // is the common case (awaiting the webhook). FAILED is *also* reconcilable:
    // the attendee's own payment attempt failed, but a different captured payment
    // — an orphan left behind when its registration was deleted, or a missed
    // webhook on the same order — may still be owed to this attendee and need
    // attaching. PAID/REFUNDED are terminal money states: re-settling them would
    // double-count, so they stay blocked.
    const RECONCILABLE_STATUSES = new Set<PaymentStatus>([
      PaymentStatus.PENDING,
      PaymentStatus.FAILED,
    ]);
    if (!RECONCILABLE_STATUSES.has(registration.paymentStatus)) {
      return unchanged('Registration is already settled; nothing to reconcile');
    }

    // Path A: an explicit Razorpay payment id. Needed when a payment retry
    // overwrote `registration.orderId` (each retry creates a fresh order), so
    // the paid order is orphaned and scanning the current order finds nothing.
    // The admin pastes the `pay_…` id they can see in the Razorpay dashboard.
    const paymentId = opts?.paymentId?.trim();
    if (paymentId) {
      let payment: Awaited<ReturnType<typeof this.payments.fetchPayment>>;
      try {
        payment = await this.payments.fetchPayment(paymentId);
      } catch (err) {
        this.logger.error(`Reconcile: could not fetch payment ${paymentId}`, err);
        throw new BadRequestException('Could not fetch that payment from Razorpay');
      }

      // Safety: make sure the payment actually belongs to this registration
      // before touching money state. The order/payment `notes` carry the
      // registrationId we set at order creation.
      let linkedReg = payment.notes?.registrationId;
      if (!linkedReg && payment.orderId) {
        try {
          linkedReg = (await this.payments.fetchOrderNotes(payment.orderId)).registrationId;
        } catch {
          // Notes unavailable — fall through; amount check below still guards.
        }
      }
      if (linkedReg && linkedReg !== registrationId) {
        // The payment's notes name a different registration. Normally we refuse.
        // The one exception: the "reuse pending" cleanup at registration time
        // cancels/deletes a superseded pending row, so a payment made against
        // that earlier order can be left with no live registration. When the
        // linked registration no longer exists, the payment is a true orphan and
        // may — only on an explicit admin opt-in — be re-homed onto this
        // same-amount pending registration.
        const owner = await this.prisma.eventRegistration.findUnique({
          where: { id: linkedReg },
          select: { id: true },
        });
        if (owner) {
          throw new BadRequestException(
            `That payment belongs to a different registration (${linkedReg}), not this one.`,
          );
        }
        if (!opts?.reassignOrphan) {
          throw new BadRequestException(
            `That payment's registration (${linkedReg}) no longer exists, so the payment is orphaned. Re-run with reassignOrphan=true to attach it to this registration.`,
          );
        }
        // Confirmed orphan. Before touching money state, make sure the payment
        // is not already attached elsewhere (no double-count) and its amount
        // matches this registration (not a different attendee's payment).
        const alreadyAttached = await this.prisma.eventRegistration.findFirst({
          where: { paymentId: payment.id, NOT: { id: registrationId } },
          select: { id: true },
        });
        if (alreadyAttached) {
          throw new BadRequestException(
            `That payment is already attached to registration ${alreadyAttached.id}.`,
          );
        }
        const expectedPaise = Math.round(Number(registration.razorpayAmount) * 100);
        if (payment.amount !== expectedPaise) {
          // Amounts differ (a price/fee change, or a genuinely different ticket).
          // Refuse by default so one attendee's payment can't be silently applied
          // to another's ticket. An admin who has verified this payment really is
          // owed to this attendee can override with `allowAmountMismatch` — the
          // registration still settles at its own recorded price, so the delta
          // stays visible on the payment rather than rewriting the ticket amount.
          if (!opts?.allowAmountMismatch) {
            throw new BadRequestException(
              `Payment amount (₹${payment.amount / 100}) does not match this registration (₹${
                expectedPaise / 100
              }). Re-run with allowAmountMismatch=true to attach it anyway.`,
            );
          }
          this.logger.warn(
            `Reconcile: FORCING amount-mismatched attach — payment ${payment.id} (₹${
              payment.amount / 100
            }) onto registration ${registrationId} (expected ₹${expectedPaise / 100})`,
          );

          // Re-home the registration onto what was *actually* captured so its
          // per-registration numbers are cash-accurate. `razorpayAmount` is the
          // amount charged via Razorpay, so it becomes the captured value. To
          // preserve the razorpayAmount ≤ totalAmount invariant, lift `totalAmount` when the
          // capture exceeds it. The extra is treated as processing fee, not
          // ticket price: bump `processingFee` by the same delta so the ticket
          // base (totalAmount − processingFee) — and hence the refundable amount,
          // since refunds are base-only — stays flat. This must run BEFORE
          // settlement: completeWebhookPayment re-reads the row and only writes
          // payment status, so it will honour these amounts rather than overwrite.
          const capturedInr = payment.amount / 100;
          const oldTotal = Number(registration.totalAmount);
          const newTotal = Math.max(oldTotal, capturedInr);
          // Round to paise to avoid binary-float drift (e.g. 3.0000000001).
          const newFee =
            Math.round((Number(registration.processingFee) + (newTotal - oldTotal)) * 100) / 100;
          await this.prisma.eventRegistration.update({
            where: { id: registrationId },
            data: {
              razorpayAmount: new Prisma.Decimal(capturedInr),
              totalAmount: new Prisma.Decimal(newTotal),
              processingFee: new Prisma.Decimal(newFee),
            },
          });
          // Keep the in-memory copy consistent for downstream settlement/refund
          // math in applyReconciledPayment (its refund-base uses these fields).
          registration.razorpayAmount = new Prisma.Decimal(capturedInr);
          registration.totalAmount = new Prisma.Decimal(newTotal);
          registration.processingFee = new Prisma.Decimal(newFee);
        }
        this.logger.warn(
          `Reconcile: re-homing orphaned payment ${payment.id} (deleted reg ${linkedReg}) onto registration ${registrationId}`,
        );
        return this.applyReconciledPayment(registration, previousStatus, {
          paymentId: payment.id,
          orderId: payment.orderId ?? registration.orderId,
          status: payment.status,
          amount: payment.amount,
          amountRefunded: payment.amountRefunded,
        });
      }
      if (!linkedReg) {
        // No notes to confirm the link. Refuse rather than risk mis-attaching.
        throw new BadRequestException(
          'Could not confirm that payment belongs to this registration (no linking notes on Razorpay).',
        );
      }

      return this.applyReconciledPayment(registration, previousStatus, {
        paymentId: payment.id,
        orderId: payment.orderId ?? registration.orderId,
        status: payment.status,
        amount: payment.amount,
        amountRefunded: payment.amountRefunded,
      });
    }

    // Path B: scan the payments on the registration's current order.
    if (!registration.orderId) {
      return unchanged('No Razorpay order on this registration (free/RSVP, or the order was never created)');
    }

    let payments: Array<{
      id: string;
      status: string;
      amount: number;
      amountRefunded: number;
    }>;
    try {
      payments = await this.payments.fetchOrderPayments(registration.orderId);
    } catch (err) {
      this.logger.error(
        `Reconcile: could not fetch payments for order ${registration.orderId}`,
        err,
      );
      throw new BadRequestException('Could not fetch payment status from Razorpay');
    }

    const captured = payments.find(
      (p) => p.status === 'captured' || p.status === 'refunded',
    );
    if (captured) {
      return this.applyReconciledPayment(registration, previousStatus, {
        paymentId: captured.id,
        orderId: registration.orderId,
        status: captured.status,
        amount: captured.amount,
        amountRefunded: captured.amountRefunded,
      });
    }

    // No capture. Only mark FAILED when at least one attempt failed and none is
    // still in flight — an authorized/created payment could yet be captured.
    const hasFailed = payments.some((p) => p.status === 'failed');
    const inFlight = payments.some(
      (p) => p.status === 'authorized' || p.status === 'created',
    );
    if (hasFailed && !inFlight) {
      // Already FAILED (we now let FAILED rows in to recover orphan payments):
      // nothing to change, and re-marking would re-send the failure email.
      if (previousStatus === PaymentStatus.FAILED) {
        return unchanged('All payment attempts on Razorpay failed; registration already marked FAILED');
      }
      await this.markRegistrationFailed(registration);
      return {
        registrationId,
        previousStatus,
        newStatus: PaymentStatus.FAILED,
        changed: true,
        detail: 'All payment attempts on Razorpay failed; registration marked FAILED',
      };
    }

    return unchanged(
      payments.length === 0
        ? 'No payment attempts recorded on Razorpay yet — if the attendee paid, the order was likely replaced by a retry; paste the Razorpay payment id (pay_…) to reconcile it directly'
        : 'A payment is still in progress on Razorpay',
    );
  }

  /**
   * Apply the true Razorpay outcome of a single payment to a PENDING
   * registration. Branches on refunds so a captured-then-refunded payment is
   * never mistaken for a clean confirmation:
   *   - captured, not refunded  → PAID (full seat/ticket settlement)
   *   - captured, fully refunded → REFUNDED + registration CANCELLED, no tickets
   *   - captured, partially refunded → left PENDING and reported (needs a human;
   *     issuing a ticket vs. treating as cancelled is a judgement call)
   *   - failed → FAILED
   * `amount`/`amountRefunded` are in paise.
   */
  private async applyReconciledPayment(
    registration: {
      id: string;
      orderId: string | null;
      totalAmount: Prisma.Decimal;
      processingFee: Prisma.Decimal;
      razorpayAmount: Prisma.Decimal;
      event: { id: string; title: string; slug: string };
      user: {
        fullName: string | null;
        username: string | null;
        identities: { email: string | null }[];
      };
    },
    previousStatus: PaymentStatus,
    payment: {
      paymentId: string;
      orderId: string | null;
      status: string;
      amount: number;
      amountRefunded: number;
    },
  ) {
    const result = (
      newStatus: PaymentStatus,
      changed: boolean,
      detail: string,
    ) => ({
      registrationId: registration.id,
      previousStatus,
      newStatus,
      changed,
      razorpayPaymentId: payment.paymentId,
      detail,
    });

    if (payment.status === 'captured' || payment.status === 'refunded') {
      const refunded = payment.amountRefunded / 100;
      const charged = payment.amount / 100;
      // The processing fee is never refundable, so the base (ticket price) is
      // the most that can come back. Treat "base fully returned" as a full
      // refund even though the retained fee leaves refunded < charged.
      const base =
        Math.round(
          (Number(registration.totalAmount) - Number(registration.processingFee)) * 100,
        ) / 100;

      if (refunded <= 0) {
        // Clean capture — full settlement (tickets, seats, confirmation).
        await this.completeWebhookPayment(
          registration.id,
          payment.paymentId,
          payment.orderId ?? registration.orderId ?? '',
        );
        // Point the registration at the order that actually paid (a retry may
        // have overwritten it). completeWebhookPayment sets paymentId but not
        // orderId, so fix it here when they differ.
        if (payment.orderId && payment.orderId !== registration.orderId) {
          await this.prisma.eventRegistration.update({
            where: { id: registration.id },
            data: { orderId: payment.orderId },
          });
        }
        this.logger.log(
          `Reconcile: payment ${payment.paymentId} captured — registration ${registration.id} marked PAID`,
        );
        return result(PaymentStatus.PAID, true, 'Captured payment found on Razorpay; registration confirmed');
      }

      // Fully refunded (the whole refundable base is back with the attendee):
      // this is not a confirmed spot. Record it as REFUNDED + CANCELLED without
      // issuing tickets or a confirmation email. Seats were never counted (the
      // row never went PAID), so there is nothing to release.
      if (refunded >= base - 0.01) {
        await this.prisma.eventRegistration.update({
          where: { id: registration.id },
          data: {
            paymentStatus: PaymentStatus.REFUNDED,
            status: RegistrationStatus.CANCELLED,
            paymentId: payment.paymentId,
            ...(payment.orderId ? { orderId: payment.orderId } : {}),
            paidAt: new Date(),
            cancelledAt: new Date(),
            cancellationReason:
              'Payment captured then fully refunded in Razorpay',
            refundedAmount: base,
          },
        });
        this.logger.log(
          `Reconcile: payment ${payment.paymentId} captured then fully refunded (₹${refunded}) — registration ${registration.id} marked REFUNDED + CANCELLED`,
        );
        return result(
          PaymentStatus.REFUNDED,
          true,
          `Payment was captured then refunded (₹${refunded}) in Razorpay; registration marked refunded and cancelled. No ticket was issued.`,
        );
      }

      // Partial refund on a never-confirmed registration is ambiguous — leave it
      // for a human to resolve with the refund tools rather than guess.
      return result(
        previousStatus,
        false,
        `Payment was captured but partially refunded (₹${refunded} of ₹${charged}) in Razorpay. Resolve this one manually — it was not changed.`,
      );
    }

    if (payment.status === 'failed') {
      // Registration already FAILED — don't re-mark or re-send the failure email.
      if (previousStatus === PaymentStatus.FAILED) {
        return result(PaymentStatus.FAILED, false, 'That payment also failed on Razorpay; registration was already FAILED — nothing to attach.');
      }
      await this.markRegistrationFailed(registration);
      return result(PaymentStatus.FAILED, true, 'That payment failed on Razorpay; registration marked FAILED');
    }

    return result(
      previousStatus,
      false,
      `That payment is '${payment.status}' on Razorpay — not settled yet, so nothing was changed.`,
    );
  }

  /**
   * Admin manual resolution for a stuck PENDING registration that reconcile
   * cannot settle — an abandoned duplicate, or a row whose real payment lives on
   * a different registration. Only two non-money outcomes are allowed:
   *   - FAILED    → payment marked FAILED, the registration record kept
   *   - CANCELLED → payment FAILED and the registration CANCELLED
   * No tickets, emails, seat changes, or Razorpay calls happen — a PENDING row
   * never held a seat or issued a ticket. Refuses anything already settled: a
   * PAID row is refunded (money involved), never overridden; and PAID is never
   * fabricated here (that path is reconcile with the real payment id).
   */
  async adminResolvePending(
    registrationId: string,
    dto: AdminResolvePendingDto,
    adminId: string,
  ) {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: { id: true, paymentStatus: true, orderId: true },
    });
    if (!registration) throw new NotFoundException('Registration not found');

    if (registration.paymentStatus !== PaymentStatus.PENDING) {
      throw new BadRequestException(
        `Only PENDING registrations can be resolved manually (this one is ${registration.paymentStatus}). Use the refund flow for a paid registration.`,
      );
    }

    const cancel = dto.outcome === 'CANCELLED';
    await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: {
        paymentStatus: PaymentStatus.FAILED,
        ...(cancel
          ? {
              status: RegistrationStatus.CANCELLED,
              cancelledAt: new Date(),
              cancellationReason:
                dto.note?.trim() || 'Marked failed & cancelled by admin',
            }
          : {}),
      },
    });

    this.logger.log(
      `Admin ${adminId} manually resolved registration ${registrationId} as ${dto.outcome}${
        dto.note ? ` — "${dto.note}"` : ''
      }`,
    );

    return {
      registrationId,
      previousStatus: PaymentStatus.PENDING,
      newStatus: PaymentStatus.FAILED,
      changed: true,
      detail: cancel
        ? 'Registration marked failed and cancelled.'
        : 'Registration marked failed.',
    };
  }

  /**
   * Complete payment from webhook
   */
  private async completeWebhookPayment(
    registrationId: string,
    paymentId: string,
    orderId: string,
  ): Promise<void> {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: {
        event: true,
        user: true,
      },
    });

    if (!registration) {
      return;
    }

    // Same seat-accounting rule as verifyPayment: an offered waiting list spot
    // already holds its seat, so converting must not claim another. Reached
    // when the attendee pays but the app never returns to confirm.
    if (registration.waitlistStatus === WaitlistStatus.OFFERED) {
      await this.waitlist.convert(registrationId, { paymentId, orderId });
      await this.sendRegistrationConfirmations(registrationId);
      return;
    }

    // Atomic claim: this webhook races the client verify (and Razorpay's own
    // webhook retries) to complete the same registration. Only the caller whose
    // conditional update actually flips a PENDING/FAILED row to PAID (count === 1)
    // proceeds to increment seats and send confirmations. A loser (count === 0)
    // returns without touching counts or sending — otherwise the seat counts
    // double and the attendee is confirmed twice.
    let claimedWin = false;
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.eventRegistration.updateMany({
        where: { id: registrationId, paymentStatus: { not: PaymentStatus.PAID } },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentId,
          paidAt: new Date(),
        },
      });
      if (claimed.count === 0) return; // another path already completed this
      claimedWin = true;

      // Payment settled via webhook — promote a held coupon reservation to
      // permanent, inside the same exactly-once guard as the seat increment.
      await this.coupons.confirmByRegistration(tx, registration.id);

      // Increment counts — a group occupies groupSize seats, not 1.
      const seats = this.seatsFor(registration);
      if (registration.ticketTypeId) {
        await tx.eventTicketType.update({
          where: { id: registration.ticketTypeId },
          data: { soldCount: { increment: seats } },
        });
      }

      await tx.event.update({
        where: { id: registration.eventId },
        data: { registeredCount: { increment: seats } },
      });

      // Generate tickets
      for (let i = 0; i < registration.quantity; i++) {
        await tx.eventTicket.create({
          data: {
            registrationId: registration.id,
            ticketCode: this.generateTicketCode(),
            qrCode: this.generateQRCode(),
          },
        });
      }
    });

    // Lost the race — another path already completed this registration.
    if (!claimedWin) {
      this.logger.log(
        `completeWebhookPayment: registration ${registrationId} completed ` +
          `concurrently by another path — skipping duplicate`,
      );
      return;
    }

    // Send notifications
    try {
      if (registration.user.mobileNumber) {
        const eventDate = new Date(registration.event.startDateTime).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });
        const startTime = new Date(registration.event.startDateTime).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        const endTime = new Date(registration.event.endDateTime).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        const tickets = await this.prisma.eventTicket.findMany({
          where: { registrationId: registration.id },
        });

        await this.whatsappService.sendRegistrationConfirmation(
          registration.user.mobileNumber,
          {
            userName: registration.user.fullName || registration.user.username || 'there',
            eventTitle: registration.event.title,
            eventDate,
            eventTime: `${startTime} - ${endTime} IST`,
            venueName: registration.event.venueName || undefined,
            city: registration.event.city || undefined,
            isOnline: registration.event.type === 'ONLINE',
            onlineUrl: registration.event.onlineUrl || undefined,
          },
        );
      }
    } catch (error) {
      this.logger.error('Failed to send notification from webhook', error);
    }

    // Email the shared ticket to each group member. leadEmail is null because
    // this fallback path sends the lead no dedicated email, so if the lead is
    // among the members they should still receive their copy here.
    await this.sendGroupMemberConfirmations(
      registration,
      registration.event,
      registration.qrCode,
      undefined,
      null,
    );

    // Clear cache
    const client = this.cache['redis'].getClient();
    if (client) {
      await client.del(`order:${orderId}`);
    }
    await this.cache.invalidateCheckinCache(registration.eventId);

    this.logger.log(`Webhook processed payment for registration ${registrationId}`);
  }

  /**
   * Attendee cancels their own registration, looked up by event (+ optional
   * ticket type). Prefer {@link cancelMyRegistration} — it's keyed by the
   * registration id, so it can't pick the wrong row.
   */
  async cancelRegistration(
    eventId: string,
    userId: string,
    ticketTypeId?: string | null,
    reason?: string | null,
  ): Promise<any> {
    const registration = await this.prisma.eventRegistration.findFirst({
      where: {
        eventId,
        userId,
        ...(ticketTypeId !== undefined ? { ticketTypeId: ticketTypeId || null } : {}),
      },
      include: {
        event: true,
        user: true,
      },
    });

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }
    return this.performSelfCancellation(registration, userId, reason);
  }

  /** Attendee cancels their own registration by id (free tickets only). */
  async cancelMyRegistration(
    registrationId: string,
    userId: string,
    reason?: string | null,
  ): Promise<any> {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: { event: true, user: true },
    });
    // Same 404 for "not yours" so ids can't be probed.
    if (!registration || registration.userId !== userId) {
      throw new NotFoundException('Registration not found');
    }
    return this.performSelfCancellation(registration, userId, reason);
  }

  /**
   * Organiser cancels an attendee's registration (free / unpaid only); the
   * reason is stored and included in their cancellation email. Same seat, ticket, waitlist and notification
   * handling as a self-cancel; a paid ticket goes through a refund request.
   */
  async organiserCancelRegistration(
    actorId: string,
    eventId: string,
    registrationId: string,
    reason?: string | null,
  ): Promise<any> {
    const registration = await this.prisma.eventRegistration.findFirst({
      where: { id: registrationId, eventId },
      include: { event: true, user: true },
    });
    if (!registration) {
      throw new NotFoundException('Registration not found');
    }
    const result = await this.performSelfCancellation(
      registration,
      registration.userId,
      reason,
      { defaultReason: 'Cancelled by the organiser', byOrganiser: true },
    );
    this.logger.log(
      `Organiser ${actorId} cancelled registration ${registrationId} (event ${eventId})`,
    );
    return result;
  }

  /**
   * Shared cancel (attendee self-cancel and organiser cancel). Only free /
   * unpaid registrations may cancel directly: a paid ticket must go through
   * the refund flow (organiser → admin approval, base-only), which this path
   * would otherwise bypass. `userId` is always the attendee.
   */
  private async performSelfCancellation(
    registration: Prisma.EventRegistrationGetPayload<{
      include: { event: true; user: true };
    }>,
    userId: string,
    reason?: string | null,
    opts: { defaultReason?: string; byOrganiser?: boolean } = {},
  ): Promise<any> {
    const eventId = registration.eventId;
    const defaultReason = opts.defaultReason ?? 'Cancelled by attendee';

    if (registration.status === RegistrationStatus.CANCELLED) {
      throw new BadRequestException('Registration already cancelled');
    }

    if (registration.event.startDateTime < new Date()) {
      throw new BadRequestException('Cannot cancel past event registration');
    }

    const hasPaid =
      Number(registration.totalAmount) > 0 &&
      (registration.paymentStatus === PaymentStatus.PAID ||
        registration.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED);
    if (hasPaid) {
      throw new BadRequestException(
        'Paid tickets can’t be cancelled directly. Raise a refund request instead.',
      );
    }

    // Paid registrations are rejected above, so there's never money to return.
    const razorpayRefundInitiated = false;

    await this.prisma.$transaction(async (tx) => {
      // Update registration status
      await tx.eventRegistration.update({
        where: { id: registration.id },
        data: {
          status: RegistrationStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: reason?.trim() || defaultReason,
        },
      });

      // Decrement counts — release the same seats the group occupied.
      //
      // Waiting list rows are the exception, and getting this wrong corrupts
      // the counters permanently:
      //   WAITING  holds no seat and is not an attendee, so neither counter
      //            moves; it only leaves the queue.
      //   OFFERED  holds a seat but is not yet an attendee, so the seat comes
      //            back while registeredCount (never incremented) stays put.
      const seats = this.seatsFor(registration);
      const isQueued =
        registration.waitlistStatus === WaitlistStatus.WAITING;
      const isUnconvertedOffer =
        registration.waitlistStatus === WaitlistStatus.OFFERED;

      if (!isQueued && !isUnconvertedOffer) {
        await tx.event.update({
          where: { id: eventId },
          data: { registeredCount: { decrement: seats } },
        });
      }

      if (isQueued) {
        await tx.event.update({
          where: { id: eventId },
          data: { waitlistCount: { decrement: 1 } },
        });
      }

      if (registration.ticketTypeId && !isQueued) {
        await tx.eventTicketType.update({
          where: { id: registration.ticketTypeId },
          data: { soldCount: { decrement: seats } },
        });
      }

      // Only an unresolved entry becomes DECLINED. A CONVERTED row keeps that
      // status: it records how the person got in, which stays true after they
      // cancel, and rewriting it would lose that history.
      if (isQueued || isUnconvertedOffer) {
        await tx.eventRegistration.update({
          where: { id: registration.id },
          data: {
            waitlistStatus: WaitlistStatus.DECLINED,
            waitlistOfferExpiresAt: null,
          },
        });
      }

      // Cancel tickets
      await tx.eventTicket.updateMany({
        where: { registrationId: registration.id },
        data: { status: TicketStatus.CANCELLED },
      });
    });

    // Push only when the organiser cancelled; a self-cancel already happened in-app.
    if (opts.byOrganiser) {
      this.events.emit(NotificationEvents.RegistrationUpdate, {
        userId,
        eventId,
        eventTitle: registration.event.title,
        eventSlug: registration.event.slug,
        kind: 'CANCELLED',
      } satisfies RegistrationUpdateEvent);
    }

    // Send email notification (non-blocking)
    const identity = await this.prisma.userIdentity.findFirst({
      where: { userId, email: { not: null }, isPrimary: true },
      select: { email: true },
    });

    if (identity?.email) {
      this.emailService.sendCancellationConfirmation({
        email: identity.email,
        userName: registration.user.fullName || registration.user.username || 'there',
        eventId: registration.event.id,
        eventTitle: registration.event.title,
        razorpayRefundInitiated,
        razorpayRefundAmount: razorpayRefundInitiated ? Number(registration.razorpayAmount) : undefined,
        // Only an organiser's reason is news to the attendee; their own isn't echoed back.
        organiserReason: opts.byOrganiser ? reason?.trim() || undefined : undefined,
      }).catch(err => this.logger.error('Failed to send cancellation confirmation email', err));
    }

    // Notify any claimed group members that the lead cancelled the booking.
    if ((registration.groupSize ?? 0) > 1) {
      this.groupSeats
        .notifyGroupCancelled(registration.id, registration.event.title)
        .catch((err) =>
          this.logger.error('Failed to notify group members of cancellation', err),
        );
    }

    // Invalidate cache
    await this.cache.invalidateCheckinCache(eventId);

    this.logger.log(`Cancelled registration ${registration.id}`);


    return {
      message: 'Registration cancelled successfully',
      razorpayRefundInitiated,
    };
  }

  /**
   * Organiser action: RESTORE a cancelled registration back to REGISTERED.
   *
   * This is the inverse of the seat/ticket side of {@link cancelRegistration}:
   * it re-consumes the seat, re-activates the tickets and clears the cancel
   * stamp. It deliberately does NOT touch money — a refund that was already paid
   * out is not reversed here; that is handled through the refund tools so a
   * restore can never silently grant a free ticket. The typical case this exists
   * for is a paid attendee whose payment landed just after they cancelled.
   *
   * Guarded (see below) against the cases where a blind un-cancel would corrupt
   * state: waitlist rows (whose counters follow a different machine) and a clash
   * with a live registration the attendee made after cancelling — that pair is
   * exactly what the partial unique index forbids.
   */
  async restoreRegistration(
    userId: string,
    eventId: string,
    registrationId: string,
  ) {
    const registration = await this.prisma.eventRegistration.findFirst({
      where: { id: registrationId, eventId },
      include: { ticketType: true, tickets: true },
    });
    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    if (registration.status !== RegistrationStatus.CANCELLED) {
      throw new BadRequestException('Only a cancelled registration can be restored');
    }

    // Waitlist rows are cancelled into a DECLINED state whose counters differ
    // from a direct booking's; restoring one safely means re-entering the queue,
    // not simply flipping a seat back. Out of scope — keep the counters honest.
    if (registration.waitlistStatus !== null || registration.isWaitlisted) {
      throw new BadRequestException(
        'Waitlisted registrations can’t be restored here. Re-add the attendee instead.',
      );
    }

    // The partial unique index exempts CANCELLED rows, so the attendee may have
    // re-registered since. Restoring would then leave two active rows for the
    // same (event, user, ticket type) — refuse with a clear message.
    const clash = await this.prisma.eventRegistration.findFirst({
      where: {
        eventId,
        userId: registration.userId,
        ticketTypeId: registration.ticketTypeId,
        status: { not: RegistrationStatus.CANCELLED },
        id: { not: registration.id },
      },
    });
    if (clash) {
      throw new ConflictException(
        'This attendee already has an active registration for this ticket type.',
      );
    }

    const seats = this.seatsFor(registration);

    // Don't let a restore oversell a limited ticket type (same rule the buy path
    // enforces). Unlimited (null totalQuantity) always passes.
    if (
      registration.ticketType &&
      registration.ticketType.totalQuantity != null &&
      registration.ticketType.soldCount + seats >
        registration.ticketType.totalQuantity
    ) {
      throw new BadRequestException(
        'Restoring this registration would exceed the ticket type’s capacity.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.eventRegistration.update({
        where: { id: registration.id },
        data: {
          status: RegistrationStatus.REGISTERED,
          cancelledAt: null,
          cancellationReason: null,
        },
      });

      // Re-consume the seats the cancellation released.
      await tx.event.update({
        where: { id: eventId },
        data: { registeredCount: { increment: seats } },
      });
      if (registration.ticketTypeId) {
        await tx.eventTicketType.update({
          where: { id: registration.ticketTypeId },
          data: { soldCount: { increment: seats } },
        });
      }

      // Re-activate the tickets the cancellation voided. If the row never had
      // tickets issued (e.g. it was cancelled before its payment landed), mint
      // the missing ones so the attendee has a scannable ticket again.
      await tx.eventTicket.updateMany({
        where: { registrationId: registration.id },
        data: { status: TicketStatus.ACTIVE },
      });
      const activeTickets = await tx.eventTicket.count({
        where: {
          registrationId: registration.id,
          status: TicketStatus.ACTIVE,
        },
      });
      for (let i = activeTickets; i < (registration.quantity || 1); i++) {
        await tx.eventTicket.create({
          data: {
            registrationId: registration.id,
            ticketCode: this.generateTicketCode(),
            qrCode: this.generateQRCode(),
          },
        });
      }
    });

    await this.cache.invalidateCheckinCache(eventId);
    this.logger.log(
      `Restored registration ${registration.id} (event ${eventId}) by user ${userId}`,
    );

    return this.buildRegistrationDetail(eventId, registrationId);
  }
}
