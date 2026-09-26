import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CouponDiscountType,
  CouponRedemptionStatus,
  EventCoupon,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCouponDto, UpdateCouponDto } from './dto';
import { computeCouponDiscount } from './coupon-pricing';

/** A Prisma transaction client (what `$transaction(async (tx) => ...)` yields). */
type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * How long a coupon slot stays reserved while a buyer completes payment. A
 * Razorpay checkout that is going to succeed does so in a minute or two; past
 * this the reservation is swept and the held slot returns to the pool. Mirrors
 * the waitlist offer TTL idea, at a much shorter horizon.
 */
export const COUPON_RESERVATION_TTL_MINUTES = 30;

export interface ResolvedDiscount {
  coupon: EventCoupon;
  /** Money taken off the base amount. */
  discount: number;
}

@Injectable()
export class CouponsService {
  private readonly logger = new Logger(CouponsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Management (organiser CRUD) — gated at the controller by @Can(EVENT_EDIT).
  // ---------------------------------------------------------------------------

  async create(eventId: string, dto: CreateCouponDto): Promise<EventCoupon> {
    this.assertValueInRange(dto.discountType, dto.discountValue);
    this.assertWindow(dto.startsAt, dto.expiresAt);

    try {
      return await this.prisma.eventCoupon.create({
        data: {
          eventId,
          code: dto.code.trim().toUpperCase(),
          description: dto.description,
          discountType: dto.discountType,
          discountValue: new Prisma.Decimal(dto.discountValue),
          maxDiscountAmount:
            dto.maxDiscountAmount != null
              ? new Prisma.Decimal(dto.maxDiscountAmount)
              : null,
          minPurchaseAmount:
            dto.minPurchaseAmount != null
              ? new Prisma.Decimal(dto.minPurchaseAmount)
              : null,
          usageLimit: dto.usageLimit ?? null,
          perUserLimit: dto.perUserLimit ?? 1,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          appliesToTicketTypeIds: dto.appliesToTicketTypeIds ?? [],
          isActive: dto.isActive ?? true,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `A coupon with code "${dto.code.toUpperCase()}" already exists for this event`,
        );
      }
      throw err;
    }
  }

  /** All coupons for an event, newest first, with live redemption counts. */
  async listForEvent(eventId: string) {
    const coupons = await this.prisma.eventCoupon.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
    });

    // usedCount already reflects confirmed + reserved. Surface the confirmed-only
    // number too so the organiser sees real redemptions vs slots in flight.
    const confirmed = await this.prisma.couponRedemption.groupBy({
      by: ['couponId'],
      where: {
        couponId: { in: coupons.map((c) => c.id) },
        status: CouponRedemptionStatus.CONFIRMED,
      },
      _count: { _all: true },
    });
    const confirmedByCoupon = new Map(
      confirmed.map((row) => [row.couponId, row._count._all]),
    );

    return coupons.map((c) => ({
      ...c,
      confirmedCount: confirmedByCoupon.get(c.id) ?? 0,
    }));
  }

  async update(
    eventId: string,
    couponId: string,
    dto: UpdateCouponDto,
  ): Promise<EventCoupon> {
    const existing = await this.getOwned(eventId, couponId);

    const discountType = dto.discountType ?? existing.discountType;
    const discountValue =
      dto.discountValue ?? Number(existing.discountValue);
    this.assertValueInRange(discountType, discountValue);
    this.assertWindow(
      dto.startsAt ?? existing.startsAt?.toISOString(),
      dto.expiresAt ?? existing.expiresAt?.toISOString(),
    );

    try {
      return await this.prisma.eventCoupon.update({
        where: { id: couponId },
        data: {
          code: dto.code ? dto.code.trim().toUpperCase() : undefined,
          description: dto.description,
          discountType: dto.discountType,
          discountValue:
            dto.discountValue != null
              ? new Prisma.Decimal(dto.discountValue)
              : undefined,
          maxDiscountAmount:
            dto.maxDiscountAmount !== undefined
              ? dto.maxDiscountAmount != null
                ? new Prisma.Decimal(dto.maxDiscountAmount)
                : null
              : undefined,
          minPurchaseAmount:
            dto.minPurchaseAmount !== undefined
              ? dto.minPurchaseAmount != null
                ? new Prisma.Decimal(dto.minPurchaseAmount)
                : null
              : undefined,
          usageLimit:
            dto.usageLimit !== undefined ? dto.usageLimit ?? null : undefined,
          perUserLimit: dto.perUserLimit,
          startsAt:
            dto.startsAt !== undefined
              ? dto.startsAt
                ? new Date(dto.startsAt)
                : null
              : undefined,
          expiresAt:
            dto.expiresAt !== undefined
              ? dto.expiresAt
                ? new Date(dto.expiresAt)
                : null
              : undefined,
          appliesToTicketTypeIds: dto.appliesToTicketTypeIds,
          isActive: dto.isActive,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'Another coupon on this event already uses that code',
        );
      }
      throw err;
    }
  }

  /**
   * Delete a coupon. Refused once it has been redeemed (or has slots in flight)
   * so its ledger of who-paid-what is never destroyed by a cascade — deactivate
   * it instead to stop new redemptions.
   */
  async remove(eventId: string, couponId: string): Promise<{ id: string }> {
    const existing = await this.getOwned(eventId, couponId);
    const redemptions = await this.prisma.couponRedemption.count({
      where: { couponId },
    });
    if (redemptions > 0) {
      throw new BadRequestException(
        'This coupon has been used and cannot be deleted. Deactivate it instead to stop further redemptions.',
      );
    }
    await this.prisma.eventCoupon.delete({ where: { id: existing.id } });
    return { id: existing.id };
  }

  // ---------------------------------------------------------------------------
  // Buyer-facing validation / quote (no reservation).
  // ---------------------------------------------------------------------------

  /**
   * Validate a code against a ticket selection and return the discount it would
   * apply, WITHOUT holding a slot. The reservation happens only when the payment
   * order is created. Throws BadRequest with a buyer-readable reason when the
   * code does not apply.
   */
  async quote(
    eventId: string,
    userId: string,
    params: {
      code: string;
      ticketTypeId: string;
      quantity?: number;
      groupSize?: number;
    },
  ): Promise<{ code: string; discount: number; baseAmount: number }> {
    const ticketType = await this.prisma.eventTicketType.findFirst({
      where: { id: params.ticketTypeId, eventId },
    });
    if (!ticketType) throw new NotFoundException('Ticket type not found');

    const baseAmount = this.computeBaseAmount(
      Number(ticketType.price),
      ticketType.kind,
      ticketType.groupPricingMode,
      params.quantity ?? 1,
      params.groupSize ?? ticketType.minGroupSize ?? 1,
    );

    const resolved = await this.resolveDiscount({
      eventId,
      userId,
      ticketTypeId: params.ticketTypeId,
      baseAmount,
      code: params.code,
    });

    return {
      code: resolved.coupon.code,
      discount: resolved.discount,
      baseAmount,
    };
  }

  /**
   * The base ticket amount before fees, matching the checkout path exactly so a
   * quote and the real charge never disagree.
   */
  computeBaseAmount(
    price: number,
    kind: string,
    groupPricingMode: string | null,
    quantity: number,
    groupSize: number,
  ): number {
    if (kind === 'GROUP') {
      return groupPricingMode === 'PER_PERSON' ? price * groupSize : price;
    }
    return price * quantity;
  }

  // ---------------------------------------------------------------------------
  // Reservation engine — called by RegistrationsService inside a transaction.
  // ---------------------------------------------------------------------------

  /**
   * Validate a code and compute the discount for a known base amount. Read-only:
   * runs every eligibility check but holds no slot. Throws BadRequest when the
   * code does not apply. Callers reserve the slot separately (reserveSlot).
   */
  async resolveDiscount(params: {
    eventId: string;
    userId: string;
    ticketTypeId: string;
    baseAmount: number;
    code: string;
  }): Promise<ResolvedDiscount> {
    const code = params.code.trim().toUpperCase();
    const coupon = await this.prisma.eventCoupon.findUnique({
      where: { eventId_code: { eventId: params.eventId, code } },
    });
    if (!coupon) {
      throw new BadRequestException('That discount code is not valid');
    }
    if (!coupon.isActive) {
      throw new BadRequestException('That discount code is no longer active');
    }

    const now = new Date();
    if (coupon.startsAt && now < coupon.startsAt) {
      throw new BadRequestException('That discount code is not active yet');
    }
    if (coupon.expiresAt && now > coupon.expiresAt) {
      throw new BadRequestException('That discount code has expired');
    }

    // Ticket-type restriction — empty list means "every ticket type".
    if (
      coupon.appliesToTicketTypeIds.length > 0 &&
      !coupon.appliesToTicketTypeIds.includes(params.ticketTypeId)
    ) {
      throw new BadRequestException(
        'That discount code does not apply to this ticket',
      );
    }

    if (
      coupon.minPurchaseAmount &&
      params.baseAmount < Number(coupon.minPurchaseAmount)
    ) {
      throw new BadRequestException(
        `A minimum purchase of ${Number(coupon.minPurchaseAmount)} is required for this code`,
      );
    }

    // Overall cap — a soft read here; the hard guarantee is the atomic
    // reserveSlot at checkout. Surfaced so the buyer sees a clear message
    // instead of a silent failure at pay time.
    if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException(
        'That discount code has reached its usage limit',
      );
    }

    // Per-user cap — counts this user's live (reserved + confirmed) redemptions.
    const mine = await this.prisma.couponRedemption.count({
      where: { couponId: coupon.id, userId: params.userId },
    });
    if (mine >= coupon.perUserLimit) {
      throw new BadRequestException(
        'You have already used this discount code the maximum number of times',
      );
    }

    const { discount } = computeCouponDiscount(params.baseAmount, {
      discountType: coupon.discountType,
      discountValue: Number(coupon.discountValue),
      maxDiscountAmount:
        coupon.maxDiscountAmount != null
          ? Number(coupon.maxDiscountAmount)
          : null,
      minPurchaseAmount:
        coupon.minPurchaseAmount != null
          ? Number(coupon.minPurchaseAmount)
          : null,
    });

    return { coupon, discount };
  }

  /**
   * Atomically hold one slot against the hard usage cap. Returns true if a slot
   * was taken, false if the coupon is now full or inactive. Raw SQL because the
   * guard compares two columns of the same row (`used_count < usage_limit`),
   * which Prisma's typed `where` cannot express.
   */
  async reserveSlot(tx: Tx, couponId: string): Promise<boolean> {
    const affected = await tx.$executeRaw`
      UPDATE event_coupons
      SET used_count = used_count + 1, updated_at = now()
      WHERE id = ${couponId}::uuid
        AND is_active = true
        AND (usage_limit IS NULL OR used_count < usage_limit)
    `;
    return affected === 1;
  }

  /** Write the redemption row for a just-created registration. */
  async writeRedemption(
    tx: Tx,
    params: {
      couponId: string;
      registrationId: string;
      userId: string;
      discount: number;
      status: CouponRedemptionStatus;
    },
  ): Promise<void> {
    await tx.couponRedemption.create({
      data: {
        couponId: params.couponId,
        registrationId: params.registrationId,
        userId: params.userId,
        discountAmount: new Prisma.Decimal(params.discount),
        status: params.status,
        reservedUntil:
          params.status === CouponRedemptionStatus.RESERVED
            ? new Date(Date.now() + COUPON_RESERVATION_TTL_MINUTES * 60_000)
            : null,
      },
    });
  }

  /**
   * Payment settled — promote the reservation to permanent. The held slot stays
   * counted in used_count; only the row's status flips. No-op if the
   * registration carried no coupon.
   */
  async confirmByRegistration(tx: Tx, registrationId: string): Promise<void> {
    await tx.couponRedemption.updateMany({
      where: {
        registrationId,
        status: CouponRedemptionStatus.RESERVED,
      },
      data: { status: CouponRedemptionStatus.CONFIRMED, reservedUntil: null },
    });
  }

  /**
   * Abandoned / failed checkout — return the held slot to the pool. Only RESERVED
   * rows release; a CONFIRMED redemption is permanent. No-op when the
   * registration carried no coupon.
   */
  async releaseByRegistration(tx: Tx, registrationId: string): Promise<void> {
    const redemption = await tx.couponRedemption.findUnique({
      where: { registrationId },
    });
    if (!redemption || redemption.status !== CouponRedemptionStatus.RESERVED) {
      return;
    }
    await tx.couponRedemption.delete({ where: { id: redemption.id } });
    await tx.$executeRaw`
      UPDATE event_coupons
      SET used_count = GREATEST(used_count - 1, 0), updated_at = now()
      WHERE id = ${redemption.couponId}::uuid
    `;
  }

  /**
   * Release reservations that were never paid within the TTL. Returns how many
   * slots were freed. Runs each release in its own transaction so one bad row
   * cannot stall the sweep.
   */
  async sweepExpiredReservations(): Promise<number> {
    const stale = await this.prisma.couponRedemption.findMany({
      where: {
        status: CouponRedemptionStatus.RESERVED,
        reservedUntil: { lt: new Date() },
      },
      select: { registrationId: true },
      take: 500,
    });

    let freed = 0;
    for (const row of stale) {
      try {
        await this.prisma.$transaction((tx) =>
          this.releaseByRegistration(tx, row.registrationId),
        );
        freed++;
      } catch (err) {
        this.logger.error(
          `Failed to release stale coupon reservation for registration ${row.registrationId}`,
          err as Error,
        );
      }
    }
    if (freed > 0) {
      this.logger.log(`Released ${freed} expired coupon reservation(s)`);
    }
    return freed;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async getOwned(
    eventId: string,
    couponId: string,
  ): Promise<EventCoupon> {
    const coupon = await this.prisma.eventCoupon.findFirst({
      where: { id: couponId, eventId },
    });
    if (!coupon) throw new NotFoundException('Coupon not found');
    return coupon;
  }

  private assertValueInRange(type: CouponDiscountType, value: number): void {
    if (value <= 0) {
      throw new BadRequestException('Discount value must be greater than 0');
    }
    if (type === CouponDiscountType.PERCENT && value > 100) {
      throw new BadRequestException('A percentage discount cannot exceed 100');
    }
  }

  private assertWindow(startsAt?: string | null, expiresAt?: string | null): void {
    if (startsAt && expiresAt && new Date(startsAt) >= new Date(expiresAt)) {
      throw new BadRequestException('The start date must be before the end date');
    }
  }
}
