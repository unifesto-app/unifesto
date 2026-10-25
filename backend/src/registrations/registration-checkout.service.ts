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
import { assertSpaceLive } from '../spaces/space-access';
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
  resolveGroupSize,
  seatsFor,
  SETTLEABLE_PAYMENT,
  ticketsIn,
} from './registration.util';
import { RegistrationConfirmationsService } from './registration-confirmations.service';
import { TermsService, dealColumns } from '../subscription/terms.service';

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
    private readonly terms: TermsService,
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
    // No new sales while the space is taken down (J16).
    await assertSpaceLive(this.prisma, { id: event.spaceId });
    if (!(await canAccessSpaceOnlyEvent(this.prisma, event, userId))) {
      throw new ForbiddenException(
        `This event is only open to members of ${event.space?.name ?? 'its space'}. Join the space to register.`,
      );
    }
    await this.assertAgeConfirmed(userId);
  }

  /**
   * Z11 (DPDP): self-registration needs an 18+ confirmation once the platform
   * switch is on. Off by default (4.x apps cannot send it). Organiser manual
   * add/import never comes through here, which is the under-18 guest path.
   */
  private async assertAgeConfirmed(userId: string) {
    const config = await this.prisma.platformConfig.findUnique({
      where: { id: 'global' },
      select: { requireAgeConfirmation: true },
    });
    if (!config?.requireAgeConfirmation) return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ageConfirmedAt: true },
    });
    if (user?.ageConfirmedAt) return;
    throw new BadRequestException({
      statusCode: 400,
      code: 'AGE_CONFIRMATION_REQUIRED',
      message:
        'Confirm you are 18 or older to register. Under 18? Ask the organiser to register you through a parent or guardian.',
    });
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

    // Validated before anything uses it, the waiting list included (J8).
    const groupSize = resolveGroupSize(ticketType, dto.groupSize);

    // Seats this booking will occupy — a group takes groupSize seats, not 1.
    const plannedSeats = groupSize ?? dto.quantity;

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
          groupSize: groupSize ?? undefined,
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
    let baseAmount: number;
    if (groupSize != null) {
      this.assertGroupMembersComplete(dto.groupMembers, groupSize);
      baseAmount =
        ticketType.groupPricingMode === 'PER_PERSON'
          ? Number(ticketType.price) * groupSize
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

    // Priced under the space's terms (T4/T5): the event's or space's deal,
    // else the rate card. The organiser may absorb the buyer fee (A33): then
    // the buyer pays the listed price and the fee comes out of it.
    const terms = await this.terms.resolve(event.spaceId, eventId);
    const sale = this.payments.priceSale(
      baseAmount,
      ticketsIn(ticketType, { quantity: dto.quantity, groupSize }),
      event.absorbProcessingFee,
      terms,
    );
    const processingFee = sale.fee;
    const totalAmount = sale.total;

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
            ...dealColumns(terms),
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

      // Same confirmations as every other settled registration: WhatsApp,
      // ticket email, group invite, push and group member tickets.
      void this.confirmations
        .sendRegistrationConfirmations(registration.id)
        .catch((err) => this.logger.error('Failed to send free-ticket confirmations', err));

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
            ...dealColumns(terms),
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

    await assertSpaceLive(this.prisma, { events: { some: { id: registration.eventId } } });

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
