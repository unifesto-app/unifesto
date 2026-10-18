import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { enforceFormAnswers } from './form-answers.policy';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { CacheService } from '../cache/cache.service';
import { PaymentsService } from '../payments/payments.service';
import { takeSeats } from './capacity.util';
import { CouponsService, type ResolvedDiscount } from '../coupons/coupons.service';
import {
  EventRegistration,
  PaymentStatus,
  RegistrationStatus,
  Prisma,
  WaitlistStatus,
  CouponRedemptionStatus,
  EventVisibility,
} from '@prisma/client';
import { canAccessSpaceOnlyEvent } from '../events/event-access';
import {
  RegisterForEventDto,
  CreateOrderDto,
  OrderResponseDto,
  GroupMemberDto,
  WaitlistJoinResponseDto,
} from './dto';
import { WaitlistService } from './waitlist.service';
import { GroupSeatsService } from './group-seats.service';
import { utmColumns } from '../common/utm';
import {
  generateQRCode,
  generateTicketCode,
  seatsFor,
  formatEventDate,
  formatEventTime,
  SETTLEABLE_PAYMENT,
  ticketsIn,
} from './registration.util';
import { RegistrationConfirmationsService } from './registration-confirmations.service';

/**
 * Starting a registration: free RSVP, paid checkout (Razorpay order + coupon
 * reservation), the waiting-list fallback and paying an offered spot.
 */
@Injectable()
export class RegistrationCheckoutService {
  // Same log context as before the split, so log searches keep working.
  private readonly logger = new Logger('RegistrationsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly whatsappService: WhatsAppService,
    private readonly cache: CacheService,
    private readonly payments: PaymentsService,
    private readonly waitlist: WaitlistService,
    private readonly groupSeats: GroupSeatsService,
    private readonly coupons: CouponsService,
    private readonly confirmations: RegistrationConfirmationsService,
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
   * Guard a ticket's optional on-sale window at purchase time.
   *
   * Either bound may be null (open-ended). This runs before the capacity /
   * waitlist branch, so a ticket outside its window is rejected outright rather
   * than dropping the buyer onto a waiting list — a scheduled drop that hasn't
   * opened, or a sale that has closed, is simply not for sale right now.
   */
  /**
   * Clear an attempt that never settled money (PENDING / FAILED) so a fresh one
   * can insert past the partial unique index (A19).
   *  - Waiting list rows are refused, never cleared: OFFERED holds a seat and
   *    WAITING a queue place, and deleting either corrupts the counters.
   *  - A row that reached Razorpay (an order, or a curator's payment link) is
   *    cancelled, not deleted, so a late payment still finds it; its link is
   *    cancelled too so the attendee can't pay twice.
   *  - Anything else never had money attached and is deleted.
   * The coupon slot is released first either way (the delete cascade would drop
   * the redemption without decrementing usedCount).
   */
  private async clearAbandonedAttempt(
    stale: {
      id: string;
      orderId: string | null;
      paymentLinkId: string | null;
      status: RegistrationStatus;
      waitlistStatus: WaitlistStatus | null;
    },
    reason: string,
  ): Promise<void> {
    if (stale.waitlistStatus === WaitlistStatus.OFFERED) {
      throw new BadRequestException(
        'A seat is being held for you from the waiting list. Pay for it from your waiting list offer.',
      );
    }
    if (stale.waitlistStatus === WaitlistStatus.WAITING) {
      throw new BadRequestException(
        "You're on the waiting list for this ticket. Leave the waiting list to book it directly.",
      );
    }
    if (stale.status === RegistrationStatus.CANCELLED) return; // already superseded

    await this.prisma.$transaction(async (tx) => {
      await this.coupons.releaseByRegistration(tx, stale.id);
      if (stale.orderId || stale.paymentLinkId) {
        await tx.eventRegistration.update({
          where: { id: stale.id },
          data: {
            status: RegistrationStatus.CANCELLED,
            cancelledAt: new Date(),
            cancellationReason: reason,
          },
        });
      } else {
        await tx.eventRegistration.delete({ where: { id: stale.id } });
      }
    });
    if (stale.paymentLinkId) await this.payments.cancelPaymentLink(stale.paymentLinkId);
  }

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

    // Clear abandoned (unpaid) attempts for the same ticket type instead of
    // leaving a duplicate behind. A cancelled row is skipped so a superseded
    // checkout is never re-matched.
    const abandoned = event.registrations.filter(
      (r) =>
        SETTLEABLE_PAYMENT.includes(r.paymentStatus) &&
        r.status !== RegistrationStatus.CANCELLED &&
        (r.ticketTypeId || null) === requestedTicketTypeId,
    );
    for (const stale of abandoned) {
      await this.clearAbandonedAttempt(stale, 'Superseded by a new registration attempt');
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
    const processingFee = this.payments.computeProcessingFee(
      basePrice,
      ticketType ? ticketsIn(ticketType, { quantity, groupSize }) : quantity,
    );

    const totalAmount = basePrice + processingFee;

    // The full total is paid via Razorpay (the processing fee is never waived).
    const razorpayAmount = totalAmount;

    if (razorpayAmount === 0) {
      return this.completeRSVP(userId, eventId, dto, event);
    }

    const qrCode = generateQRCode();

    // The PENDING row and its group seats commit together: the lead-typed
    // members ride on the seats until payment confirms them.
    const registration = await this.prisma.$transaction(async (tx) => {
      const reg = await tx.eventRegistration.create({
        data: {
          eventId,
          userId,
          ticketTypeId: dto.ticketTypeId,
          quantity,
          groupSize,
          totalAmount: new Prisma.Decimal(totalAmount),
          razorpayAmount: new Prisma.Decimal(razorpayAmount),
          processingFee: new Prisma.Decimal(processingFee),
          paymentStatus: razorpayAmount > 0 ? PaymentStatus.PENDING : PaymentStatus.PAID,
          qrCode,
          formResponses: dto.formResponses || {},
          ...utmColumns(dto),
        },
      });
      await this.groupSeats.createSeatsForRegistration(tx, {
        registrationId: reg.id,
        leadUserId: userId,
        seatCount: seatsFor(reg),
        groupMembers: dto.groupMembers ?? null,
      });
      return reg;
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
    const abandonedRegs = sameTypeRegs.filter((r) =>
      SETTLEABLE_PAYMENT.includes(r.paymentStatus),
    );
    for (const stale of abandonedRegs) {
      await this.clearAbandonedAttempt(stale, 'Superseded by a new checkout attempt');
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

    const processingFee = this.payments.computeProcessingFee(
      baseAmount,
      ticketsIn(ticketType, { quantity: dto.quantity, groupSize }),
    );
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

        // Seats are created with the PENDING row (S42); confirmation finds them.
        await this.groupSeats.createSeatsForRegistration(tx, {
          registrationId: reg.id,
          leadUserId: userId,
          seatCount: seatsFor(reg),
          groupMembers: dto.groupMembers ?? null,
        });

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
}
