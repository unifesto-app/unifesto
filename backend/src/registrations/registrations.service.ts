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
import { takeSeats, SoldOutError } from './capacity.util';
import { Cron } from '@nestjs/schedule';
import { CouponsService, type ResolvedDiscount } from '../coupons/coupons.service';
import {
  EventRegistration,
  EventStatus,
  PaymentStatus,
  RegistrationStatus,
  Prisma,
  WaitlistStatus,
  GroupSeatStatus,
  CouponRedemptionStatus,
  EventVisibility,
} from '@prisma/client';
import { canAccessSpaceOnlyEvent } from '../events/event-access';
import { AuthorizationService } from '../auth/authorization';
import {
  RegisterForEventDto,
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
import { NOT_DELETED } from '../common/soft-delete';
import { utmColumns } from '../common/utm';
import { resolveRegistrationWhatsAppInvite } from '../common/whatsapp-links';
import {
  SETTLEABLE_PAYMENT,
  SETTLEABLE,
  SOLD_OUT_REASON,
  isSettleable,
  generateQRCode,
  generateTicketCode,
  seatsFor,
  formatEventDate,
  formatEventTime,
} from './registration.util';
import { RegistrationConfirmationsService } from './registration-confirmations.service';
import { RegistrationAttendeesService } from './registration-attendees.service';
import { RegistrationTransfersService } from './registration-transfers.service';
import { RegistrationExportService } from './registration-export.service';
import { RegistrationImportService } from './registration-import.service';
import { RegistrationCancellationService } from './registration-cancellation.service';

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
  ) {}

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
   * Seats for a paid registration whose payment was just claimed, inside the
   * claim's transaction. Taking is atomic against capacity; when the ticket sold
   * out while they were paying, the row is cancelled, its coupon slot freed and
   * a full refund queued (see {@link refundDue}) — returns false.
   */
  private async takeSeatsOrQueueRefund(
    tx: Prisma.TransactionClient,
    reg: { id: string; eventId: string; ticketTypeId: string | null; groupSize?: number | null; quantity: number },
  ): Promise<boolean> {
    try {
      await takeSeats(tx, reg, seatsFor(reg));
      return true;
    } catch (err) {
      if (!(err instanceof SoldOutError)) throw err;
    }
    await this.coupons.releaseByRegistration(tx, reg.id);
    await tx.eventRegistration.update({
      where: { id: reg.id },
      data: {
        status: RegistrationStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: SOLD_OUT_REASON,
        refundDueAt: new Date(),
      },
    });
    return false;
  }

  /**
   * Send a queued full refund back (everything paid, fee included: nothing was
   * delivered). Claims the row first by pushing `refundDueAt` an hour out, so
   * replicas and retries never refund twice; a failure leaves it due for the
   * next {@link retryDueRefunds} pass.
   */
  async refundDue(registrationId: string): Promise<boolean> {
    const now = new Date();
    const claimed = await this.prisma.eventRegistration.updateMany({
      where: { id: registrationId, refundDueAt: { lte: now }, paymentStatus: PaymentStatus.PAID },
      data: { refundDueAt: new Date(now.getTime() + 60 * 60_000) },
    });
    if (claimed.count !== 1) return false;
    const reg = await this.prisma.eventRegistration.findUniqueOrThrow({
      where: { id: registrationId },
      select: { paymentId: true, razorpayAmount: true },
    });
    const amount = Number(reg.razorpayAmount);
    try {
      if (amount > 0 && reg.paymentId) await this.payments.refund(reg.paymentId, amount);
    } catch (err) {
      this.logger.error(`CRITICAL: auto-refund of registration ${registrationId} failed, retrying later: ${err}`);
      return false;
    }
    await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      // The fee went back too, so none is kept: zero it so exports and the
      // financials (collected − fee − refunded) net this row to 0.
      data: {
        paymentStatus: PaymentStatus.REFUNDED,
        refundedAmount: new Prisma.Decimal(amount),
        processingFee: new Prisma.Decimal(0),
        refundDueAt: null,
      },
    });
    return true;
  }

  /** Retry automatic refunds that didn't go through the first time. */
  @Cron('*/15 * * * *')
  async retryDueRefunds(): Promise<void> {
    const due = await this.prisma.eventRegistration.findMany({
      where: { refundDueAt: { lte: new Date() }, paymentStatus: PaymentStatus.PAID },
      select: { id: true },
      take: 100,
    });
    for (const r of due) await this.refundDue(r.id);
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

    const qrCode = generateQRCode();

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

      // Take the seats atomically — a group occupies groupSize seats, not 1.
      const seats = seatsFor(registration);
      await takeSeats(tx, registration, seats);

      // Generate tickets
      for (let i = 0; i < (dto.quantity || 1); i++) {
        await tx.eventTicket.create({
          data: {
            registrationId: registration.id,
            ticketCode: generateTicketCode(),
            qrCode: generateQRCode(),
          },
        });
      }

      // Group registration → per-seat rows (fast-registration Part 2).
      await this.groupSeats.createSeatsForRegistration(tx, {
        registrationId: registration.id,
        leadUserId: registration.userId,
        seatCount: seats,
        groupMembers: dto.groupMembers ?? null,
      });
    });

    return {
      registrationId: registration.id,
      needsPayment: false,
      message: 'Registration successful',
    };
  }

  async completeRSVP(userId: string, eventId: string, dto: RegisterForEventDto, event: any) {
    const qrCode = generateQRCode();

    const registration = await this.prisma.$transaction(async (tx) => {
      const reg = await tx.eventRegistration.create({
        data: {
          eventId,
          userId,
          ticketTypeId: dto.ticketTypeId,
          quantity: dto.quantity || 1,
          groupSize: dto.groupSize ?? null,
          totalAmount: new Prisma.Decimal(0),
          paymentStatus: PaymentStatus.PAID,
          paidAt: new Date(),
          qrCode,
          formResponses: dto.formResponses || {},
          ...utmColumns(dto),
        },
      });

      // Atomic against capacity: the last seat can't go to two RSVPs.
      await takeSeats(tx, reg, seatsFor(reg));

      for (let i = 0; i < (dto.quantity || 1); i++) {
        await tx.eventTicket.create({
          data: {
            registrationId: reg.id,
            ticketCode: generateTicketCode(),
            qrCode: generateQRCode(),
          },
        });
      }

      // Free group RSVPs are still groups — seed their seat rows too, so a group
      // RSVP is never left with a JSON roster but no seats (the divergence this
      // path used to create). Any provided members become CLAIMED seats.
      await this.groupSeats.createSeatsForRegistration(tx, {
        registrationId: reg.id,
        leadUserId: userId,
        seatCount: seatsFor(reg),
        groupMembers: dto.groupMembers ?? null,
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
      this.logger.error('Failed to send RSVP WhatsApp notification', error);
    }

    // Send email notification (non-blocking)
    const identity = await this.prisma.userIdentity.findFirst({
      where: { userId, email: { not: null }, isPrimary: true },
      select: { email: true },
    });

    if (identity?.email && fullRegistration) {
      const eventDate = formatEventDate(fullRegistration.event.startDateTime);
      const eventTime = formatEventTime(
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
      await this.confirmations.sendGroupMemberConfirmations(
        fullRegistration.id,
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
      qrCode: generateQRCode(),
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
        if (stale.orderId) {
          if (stale.status === RegistrationStatus.CANCELLED) return; // already superseded
          // Reached checkout: a Razorpay order names this row, and the attendee
          // may still pay it in another tab. Deleting would orphan that money,
          // so cancel instead (same as registerForEvent); the partial unique
          // index exempts CANCELLED rows, so the new attempt can still insert.
          await tx.eventRegistration.update({
            where: { id: stale.id },
            data: {
              status: RegistrationStatus.CANCELLED,
              cancelledAt: new Date(),
              cancellationReason: 'Superseded by a new checkout attempt',
            },
          });
        } else {
          await tx.eventRegistration.delete({ where: { id: stale.id } });
        }
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
      const qrCode = generateQRCode();
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

        await takeSeats(tx, reg, seatsFor(reg));

        for (let i = 0; i < dto.quantity; i++) {
          await tx.eventTicket.create({
            data: {
              registrationId: reg.id,
              ticketCode: generateTicketCode(),
              qrCode: generateQRCode(),
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
          const evDate = formatEventDate(fullRegistration.event.startDateTime);
          const evTime = formatEventTime(
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
        const evDate = formatEventDate(fullRegistration.event.startDateTime);
        const evTime = formatEventTime(
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
    const qrCode = generateQRCode();
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

    // The signature proves a genuine payment, not that it paid for THIS row.
    // Both checks run before every branch below (PAID, waitlist, fresh).
    if (registration.eventId !== eventId) {
      throw new BadRequestException('That registration is for a different event.');
    }
    // A retry overwrites orderId; an earlier order that got paid still belongs
    // to this registration if its notes say so (same as stays).
    if (dto.razorpayOrderId !== registration.orderId) {
      const notes = await this.payments
        .fetchOrderNotes(dto.razorpayOrderId)
        .catch((): Record<string, string> => ({}));
      if (notes.registrationId !== registration.id) {
        throw new BadRequestException('That payment is for a different order.');
      }
    }

    // The Razorpay webhook (`payment.captured`) and this client-side verify
    // call race to confirm the same payment. When the webhook wins, the row is
    // already PAID by the time the browser's verify arrives — that is success,
    // not an error. The HMAC signature check above already proved this is a
    // genuine Razorpay payment, so return the confirmed registration
    // idempotently instead of surfacing a scary "Payment already completed"
    // 400 to someone who in fact paid successfully.
    // Sold out while they paid (this call or the webhook got there first): the
    // money is going back, so a retry must not read as a confirmed spot.
    if (registration.refundDueAt || registration.cancellationReason === SOLD_OUT_REASON) {
      throw new BadRequestException(
        `This ticket sold out while you were paying. Your payment of ₹${Number(registration.razorpayAmount)} is being refunded in full.`,
      );
    }
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

    // Only unsettled money can settle. Replaying the original receipt of a
    // refunded or cancelled row must not revive it (re-issued tickets, seats
    // counted twice); a capture on a superseded row is resolved via reconcile.
    if (!isSettleable(registration)) {
      throw new BadRequestException(
        'This registration can no longer be paid. If you were charged, contact support.',
      );
    }

    // A waiting list offer already claimed its seat when the organiser let the
    // person in, so this path must not claim it a second time. Conversion is
    // handled by the waiting list, which increments the attendee count only.
    if (registration.waitlistStatus === WaitlistStatus.OFFERED) {
      const { converted } = await this.waitlist.convert(registration.id, {
        paymentId: dto.razorpayPaymentId,
        orderId: dto.razorpayOrderId,
      });

      // Only the caller that won the conversion confirms; the losing side of
      // the verify/webhook race would otherwise send a duplicate.
      if (converted) await this.confirmations.sendRegistrationConfirmations(registration.id);
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
    let soldOut = false;
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.eventRegistration.updateMany({
        where: { id: registration.id, ...SETTLEABLE },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentId: dto.razorpayPaymentId,
          orderId: dto.razorpayOrderId,
          paidAt: new Date(),
        },
      });
      if (claimed.count === 0) return; // another path already completed this
      claimedWin = true;

      // Take the seats atomically — a group occupies groupSize seats, not 1.
      // Sold out while they paid: cancel and queue a full refund instead.
      if (!(await this.takeSeatsOrQueueRefund(tx, registration))) {
        soldOut = true;
        return;
      }

      // Payment settled — promote a held coupon reservation to permanent. Runs
      // inside the same exactly-once guard as the seat increment, so a coupon is
      // confirmed once and only for the caller that won the race. No-op when the
      // registration carried no coupon.
      await this.coupons.confirmByRegistration(tx, registration.id);
      const seats = seatsFor(registration);

      // Generate QR codes for each ticket
      for (let i = 0; i < registration.quantity; i++) {
        await tx.eventTicket.create({
          data: {
            registrationId: registration.id,
            ticketCode: generateTicketCode(),
            qrCode: generateQRCode(),
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

    if (soldOut) {
      await this.refundDue(registration.id);
      throw new BadRequestException(
        `This ticket sold out while you were paying. Your payment of ₹${Number(registration.razorpayAmount)} is being refunded in full.`,
      );
    }

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
        const eventDate = formatEventDate(registration.event.startDateTime);
        const eventTime = formatEventTime(
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
      await this.confirmations.sendGroupMemberConfirmations(
        registration.id,
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

  async handleRazorpayWebhook(
    rawBody: string,
    signature: string,
    razorpayEventId?: string,
  ) {
    // Verify the signature against the exact bytes Razorpay signed. Parsing the
    // payload only *after* the check means we act on the same bytes we verified.
    if (
      !signature ||
      !rawBody ||
      !this.payments.verifyWebhookSignature(rawBody, signature)
    ) {
      throw new BadRequestException('Invalid webhook signature');
    }

    // Razorpay redelivers the same event (same x-razorpay-event-id) on retries.
    // A delivery already processed is acknowledged without re-running. The id
    // is recorded only AFTER processing succeeds: claiming it first would drop
    // the event for good if the process died mid-way (Razorpay's retry would be
    // skipped and the captured money left unrecorded). Two overlapping
    // deliveries may both run; every handler below is idempotent (atomic claims).
    const dedupId = razorpayEventId ? `razorpay:${razorpayEventId}` : null;
    if (
      dedupId &&
      (await this.prisma.webhookEvent.findUnique({ where: { id: dedupId }, select: { id: true } }))
    ) {
      this.logger.log(`Razorpay webhook ${razorpayEventId} already processed — skipping`);
      return { received: true };
    }
    const result = await this.processRazorpayWebhook(rawBody);
    if (dedupId) {
      await this.prisma.webhookEvent.createMany({
        data: [{ id: dedupId, source: 'razorpay' }],
        skipDuplicates: true,
      });
    }
    return result;
  }

  private async processRazorpayWebhook(rawBody: string) {
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
        select: { id: true, paymentStatus: true, status: true },
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
      // A refunded or cancelled row must never be revived to PAID by a late or
      // replayed capture (it would re-issue tickets and re-count seats). The
      // payment stays unattached, so it shows on the orphaned-payments view
      // for an admin to resolve.
      if (!isSettleable(registration)) {
        this.logger.error(
          `payment.captured for ${registration.status}/${registration.paymentStatus} registration ${registrationId} ` +
            `(order ${orderId}, payment ${paymentId}) — not settled. Resolve via orphaned payments.`,
        );
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
    // Conditional: a capture may land between the caller's PENDING check and
    // here (attempt 1 fails, attempt 2 succeeds). PAID must never go FAILED.
    const marked = await this.prisma.eventRegistration.updateMany({
      where: { id: registration.id, paymentStatus: PaymentStatus.PENDING },
      data: { paymentStatus: PaymentStatus.FAILED },
    });
    if (marked.count !== 1) return;

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
        const outcome = await this.completeWebhookPayment(
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
        if (outcome === 'cancelled') {
          return result(
            PaymentStatus.PAID,
            true,
            'Captured payment recorded, but the registration is cancelled: no ticket was issued. Restore it or refund it',
          );
        }
        if (outcome === 'soldOut') {
          return result(
            PaymentStatus.PAID,
            true,
            'Captured payment found, but the ticket is sold out: registration cancelled and a full refund queued',
          );
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
  ): Promise<'soldOut' | 'cancelled' | void> {
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
      const { converted } = await this.waitlist.convert(registrationId, { paymentId, orderId });
      if (converted) await this.confirmations.sendRegistrationConfirmations(registrationId);
      return;
    }

    // Atomic claim: this webhook races the client verify (and Razorpay's own
    // webhook retries) to complete the same registration. Only the caller whose
    // conditional update actually flips a PENDING/FAILED row to PAID (count === 1)
    // proceeds to increment seats and send confirmations. A loser (count === 0)
    // returns without touching counts or sending — otherwise the seat counts
    // double and the attendee is confirmed twice.
    let claimedWin = false;
    let soldOut = false;
    let settledCancelled = false;
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.eventRegistration.updateMany({
        // PENDING/FAILED only: a REFUNDED / PARTIALLY_REFUNDED row must never be
        // revived (an admin reconcile may still settle a CANCELLED+PENDING row).
        where: { id: registrationId, paymentStatus: { in: SETTLEABLE_PAYMENT } },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentId,
          paidAt: new Date(),
        },
      });
      if (claimed.count === 0) return; // another path already completed this
      claimedWin = true;

      // An admin reconcile can settle a cancelled checkout. A cancelled row
      // holds no seats (cancel released nothing for it), so record the money
      // only: the team restores it (which takes seats) or refunds it.
      if (registration.status === RegistrationStatus.CANCELLED) {
        settledCancelled = true;
        await this.coupons.confirmByRegistration(tx, registration.id);
        return;
      }

      // Sold out while they paid: cancel and queue a full refund instead.
      if (!(await this.takeSeatsOrQueueRefund(tx, registration))) {
        soldOut = true;
        return;
      }

      // Payment settled via webhook — promote a held coupon reservation to
      // permanent, inside the same exactly-once guard as the seat increment.
      await this.coupons.confirmByRegistration(tx, registration.id);

      // Generate tickets
      for (let i = 0; i < registration.quantity; i++) {
        await tx.eventTicket.create({
          data: {
            registrationId: registration.id,
            ticketCode: generateTicketCode(),
            qrCode: generateQRCode(),
          },
        });
      }

      // Same group roster as the client-verify path (idempotent).
      await this.groupSeats.createSeatsForRegistration(tx, {
        registrationId: registration.id,
        leadUserId: registration.userId,
        seatCount: seatsFor(registration),
        groupMembers: registration.groupMembers as unknown[] | null,
      });
    });

    if (soldOut) {
      await this.refundDue(registrationId);
      return 'soldOut';
    }
    if (settledCancelled) {
      this.logger.warn(
        `completeWebhookPayment: payment ${paymentId} recorded on CANCELLED registration ${registrationId} — no seats or tickets; restore or refund it`,
      );
      return 'cancelled';
    }

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
    await this.confirmations.sendGroupMemberConfirmations(
      registration.id,
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
}

