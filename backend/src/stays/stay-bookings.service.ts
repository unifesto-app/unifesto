import { RedisService } from '../redis/redis.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  PaymentStatus,
  Prisma,
  StayBookingStatus,
  StayPaymentMode,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Action, AuthorizationService } from '../auth/authorization';
import {
  checkAnswers,
  formUploadPrefix,
  type FileAnswer,
} from '../registrations/form-answers.util';
import {
  ApproveStayBookingDto,
  CancelStayBookingDto,
  CreateStayBookingDto,
  ListStayBookingsQuery,
  UpdateStayBookingDto,
  VerifyStayPaymentDto,
} from './dto';
import {
  dayKey,
  firstFullNight,
  gendersFit,
  newPassCode,
  nightsBetween,
  OPEN_STATUSES,
  parseDay,
  PASS_CODE_RE,
  priceBooking,
} from './stay-rules';
import { StaysService, stayIdProofSlot } from './stays.service';

const num = (d: Prisma.Decimal | number | null | undefined) =>
  d == null ? 0 : Number(d);
const rupees = (n: number) =>
  `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const istWhen = (d: Date) =>
  d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

/** Razorpay SDK errors carry `{ error: { description } }`. */
const razorpayReason = (err: unknown): string => {
  const e = err as {
    error?: { description?: string };
    message?: string;
  } | null;
  return e?.error?.description ?? e?.message ?? 'try again';
};

/** A pass is shown (and scannable) only once the stay is confirmed. */
const PASS_STATUSES: StayBookingStatus[] = [
  StayBookingStatus.CONFIRMED,
  StayBookingStatus.CHECKED_IN,
  StayBookingStatus.CHECKED_OUT,
];

const BOOKING_INCLUDE = {
  guests: { orderBy: { order: 'asc' } },
  option: {
    select: { id: true, name: true, gender: true, pricing: true, price: true },
  },
  stay: {
    select: {
      id: true,
      name: true,
      propertyType: true,
      coverImageUrl: true,
      address: true,
      city: true,
      mapUrl: true,
      amenities: true,
      houseRules: true,
      contactName: true,
      contactPhone: true,
      checkInTime: true,
      checkOutTime: true,
      questions: { orderBy: { order: 'asc' } },
    },
  },
  event: {
    select: {
      id: true,
      title: true,
      slug: true,
      startDateTime: true,
      endDateTime: true,
      coverImageUrl: true,
    },
  },
  user: {
    select: {
      id: true,
      fullName: true,
      username: true,
      avatarUrl: true,
      mobileNumber: true,
    },
  },
} satisfies Prisma.StayBookingInclude;

type FullBooking = Prisma.StayBookingGetPayload<{
  include: typeof BOOKING_INCLUDE;
}>;

/**
 * Unifesto Stay bookings: an attendee's request, the team's review, online
 * payment, the Stay Pass and check-in at the property.
 *
 * Bed capacity is guarded by a per-option Postgres advisory lock held for the
 * length of the transaction, so two approvals (or an approval and a late
 * payment) can never both take the last bed on a night.
 */
@Injectable()
export class StayBookingsService {
  private readonly logger = new Logger(StayBookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stays: StaysService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
    private readonly authz: AuthorizationService,
    private readonly redis: RedisService,
  ) {}

  // ───────────────────────────── helpers ─────────────────────────────

  /** Serialise capacity changes on one option for the rest of the transaction. */
  private lockOption(tx: Prisma.TransactionClient, optionId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${optionId}))`;
  }

  private async fits(
    tx: Prisma.TransactionClient,
    b: {
      id: string;
      optionId: string;
      checkInDate: Date;
      checkOutDate: Date;
      guestCount: number;
    },
  ): Promise<string | null> {
    const option = await tx.stayOption.findUniqueOrThrow({
      where: { id: b.optionId },
    });
    const holds = await this.stays.holdings([b.optionId], tx, b.id);
    return firstFullNight(
      option.totalBeds,
      holds,
      b.checkInDate,
      b.checkOutDate,
      b.guestCount,
    );
  }

  private notify(
    userId: string,
    bookingId: string,
    title: string,
    body: string,
  ) {
    void this.notifications.send([userId], {
      category: 'registrationUpdates',
      title,
      body,
      deepLink: `unifesto://stay/pass/${bookingId}`,
      data: { type: 'stay', bookingId },
    });
  }

  private money(b: FullBooking) {
    return {
      paymentMode: b.paymentMode,
      baseAmount: num(b.baseAmount),
      processingFee: num(b.processingFee),
      totalAmount: num(b.totalAmount),
      paymentStatus: b.paymentStatus,
      paidAt: b.paidAt,
      refundedAmount: num(b.refundedAmount),
      paymentDueAt: b.paymentDueAt,
    };
  }

  private common(b: FullBooking) {
    return {
      id: b.id,
      status: b.status,
      checkInDate: dayKey(b.checkInDate),
      checkOutDate: dayKey(b.checkOutDate),
      nights: b.nights,
      guestCount: b.guestCount,
      arrivalAt: b.arrivalAt,
      emergencyName: b.emergencyName,
      emergencyPhone: b.emergencyPhone,
      note: b.note,
      allocation: b.allocation,
      rejectionReason: b.rejectionReason,
      cancellationReason: b.cancellationReason,
      cancelledAt: b.cancelledAt,
      checkedInAt: b.checkedInAt,
      checkedOutAt: b.checkedOutAt,
      createdAt: b.createdAt,
      ...this.money(b),
      option: {
        id: b.option.id,
        name: b.option.name,
        gender: b.option.gender,
        pricing: b.option.pricing,
        price: num(b.option.price),
      },
      stay: {
        id: b.stay.id,
        name: b.stay.name,
        propertyType: b.stay.propertyType,
        coverImageUrl: b.stay.coverImageUrl,
        address: b.stay.address,
        city: b.stay.city,
        mapUrl: b.stay.mapUrl,
        amenities: b.stay.amenities,
        houseRules: b.stay.houseRules,
        contactName: b.stay.contactName,
        contactPhone: b.stay.contactPhone,
        checkInTime: b.stay.checkInTime,
        checkOutTime: b.stay.checkOutTime,
      },
      event: b.event,
      guests: b.guests.map((g) => ({
        id: g.id,
        name: g.name,
        phone: g.phone,
        email: g.email,
        gender: g.gender,
        isBooker: g.isBooker,
        idProof: g.idProof as FileAnswer | null,
      })),
    };
  }

  /** The guest's view: the pass code only once confirmed. */
  private forGuest(b: FullBooking) {
    return {
      ...this.common(b),
      passCode: PASS_STATUSES.includes(b.status) ? b.passCode : null,
      answers: b.answers ?? {},
    };
  }

  /** The team's view: everything, plus the questions to label the answers. */
  private forTeam(b: FullBooking) {
    return {
      ...this.common(b),
      passCode: b.passCode,
      staffNote: b.staffNote,
      registrationId: b.registrationId,
      reviewedAt: b.reviewedAt,
      user: b.user,
      answers: b.answers ?? {},
      questions: b.stay.questions.map((q) => ({
        id: q.id,
        label: q.label,
        type: q.type,
        options: q.options,
        order: q.order,
      })),
    };
  }

  private async loadMine(userId: string, bookingId: string) {
    const b = await this.prisma.stayBooking.findUnique({
      where: { id: bookingId },
      include: BOOKING_INCLUDE,
    });
    if (!b || b.userId !== userId)
      throw new NotFoundException('Stay booking not found');
    return b;
  }

  private async loadForEvent(eventId: string, bookingId: string) {
    const b = await this.prisma.stayBooking.findUnique({
      where: { id: bookingId },
      include: BOOKING_INCLUDE,
    });
    if (!b || b.eventId !== eventId)
      throw new NotFoundException('Stay booking not found');
    return b;
  }

  // ───────────────────────────── attendee ─────────────────────────────

  async request(userId: string, stayId: string, dto: CreateStayBookingDto) {
    const stay = await this.prisma.stay.findUnique({
      where: { id: stayId },
      include: {
        options: true,
        questions: true,
        event: {
          select: {
            id: true,
            status: true,
            deletedAt: true,
            endDateTime: true,
            childEvents: { select: { id: true } },
          },
        },
      },
    });
    if (!stay || !stay.isPublished || stay.event.deletedAt)
      throw new NotFoundException('Stay not found');
    this.stays.assertEventOpen(stay.event);

    const option = stay.options.find(
      (o) => o.id === dto.optionId && o.isActive,
    );
    if (!option)
      throw new NotFoundException('That room option is no longer available.');

    const registration = await this.stays.eligibleRegistration(
      userId,
      stay.event,
    );
    if (!registration)
      throw new ForbiddenException(
        'Register for the event first, then request a stay.',
      );

    const open = await this.prisma.stayBooking.findFirst({
      where: { eventId: stay.eventId, userId, status: { in: OPEN_STATUSES } },
      select: { id: true },
    });
    if (open) {
      throw new ConflictException(
        'You already have a stay for this event. Cancel it first to request a different one.',
      );
    }

    // Dates
    const from = parseDay(dto.checkInDate);
    const to = parseDay(dto.checkOutDate);
    if (!from || !to)
      throw new BadRequestException('Pick real check-in and check-out dates.');
    const nights = nightsBetween(from, to);
    if (nights < 1)
      throw new BadRequestException('Check-out has to be after check-in.');
    if (from < stay.checkInFrom || to > stay.checkOutUntil) {
      throw new BadRequestException(
        `This stay takes guests from ${dayKey(stay.checkInFrom)} to ${dayKey(stay.checkOutUntil)}.`,
      );
    }

    // Guests
    const guests = dto.guests.map((g) => ({
      name: g.name.trim(),
      phone: g.phone?.trim() || null,
      email: g.email?.trim().toLowerCase() || null,
      gender: g.gender,
      idProof: g.idProof ?? null,
    }));
    if (guests.length > option.maxGuests) {
      throw new BadRequestException(
        option.maxGuests === 1
          ? 'This option is for one person per request.'
          : `One request can book at most ${option.maxGuests} guests here.`,
      );
    }
    if (guests.some((g) => !g.name))
      throw new BadRequestException('Enter every guest’s name.');
    if (!guests[0].phone)
      throw new BadRequestException('Enter your phone number.');
    if (
      !gendersFit(
        option.gender,
        guests.map((g) => g.gender),
      )
    ) {
      throw new BadRequestException(
        `${option.name} is for ${option.gender === 'MALE' ? 'men' : 'women'} only. Book a separate option for the others.`,
      );
    }
    const idPrefix = formUploadPrefix(
      stay.eventId,
      stayIdProofSlot(stayId),
      userId,
    );
    for (const [i, g] of guests.entries()) {
      if (
        g.idProof &&
        (!g.idProof.key.startsWith(idPrefix) || g.idProof.key.includes('..'))
      ) {
        throw new BadRequestException(
          `Upload ${i === 0 ? 'your' : `${g.name}'s`} ID again.`,
        );
      }
      if (stay.requireIdProof && !g.idProof) {
        throw new BadRequestException(
          `Add a photo ID for ${i === 0 ? 'yourself' : g.name}.`,
        );
      }
    }

    // Custom questions
    const checked = checkAnswers(
      stay.questions.map((q) => ({ ...q, perGroup: false })),
      dto.answers,
      { eventId: stay.eventId, enforceRequired: true, uploaderIds: [userId] },
    );
    if (checked.errors.length) throw new BadRequestException(checked.errors[0]);
    // Only keep answers to this stay's questions.
    const ids = new Set(stay.questions.map((q) => q.id));
    const answers = Object.fromEntries(
      Object.entries(checked.answers).filter(([k]) => ids.has(k)),
    );

    // Soft availability check: a request holds nothing, approval re-checks.
    const holds = await this.stays.holdings([option.id]);
    const full = firstFullNight(
      option.totalBeds,
      holds,
      from,
      to,
      guests.length,
    );
    if (full)
      throw new ConflictException(
        `Not enough beds left on the night of ${full}. Try other dates or another option.`,
      );

    const price = priceBooking({
      price: num(option.price),
      pricing: option.pricing,
      paymentMode: option.paymentMode,
      guests: guests.length,
      nights,
      feeFor: (base) => this.payments.computeProcessingFee(base),
    });

    let arrivalAt: Date | null = null;
    if (dto.arrivalAt) {
      arrivalAt = new Date(dto.arrivalAt);
      if (Number.isNaN(arrivalAt.getTime())) arrivalAt = null;
    }

    for (let attempt = 0; ; attempt++) {
      try {
        const created = await this.prisma.stayBooking.create({
          data: {
            stayId,
            optionId: option.id,
            eventId: stay.eventId,
            userId,
            registrationId: registration.id,
            checkInDate: from,
            checkOutDate: to,
            nights,
            guestCount: guests.length,
            arrivalAt,
            emergencyName: dto.emergencyName.trim(),
            emergencyPhone: dto.emergencyPhone.trim(),
            note: dto.note?.trim() || null,
            answers: answers as Prisma.InputJsonObject,
            paymentMode: price.paymentMode,
            baseAmount: price.baseAmount,
            processingFee: price.processingFee,
            totalAmount: price.totalAmount,
            paymentStatus:
              price.paymentMode === StayPaymentMode.FREE
                ? null
                : PaymentStatus.PENDING,
            passCode: newPassCode(),
            guests: {
              create: guests.map((g, i) => ({
                name: g.name,
                phone: g.phone,
                email: g.email,
                gender: g.gender,
                isBooker: i === 0,
                idProof: g.idProof
                  ? {
                      key: g.idProof.key,
                      name: g.idProof.name,
                      size: g.idProof.size,
                      mime: g.idProof.mime,
                    }
                  : Prisma.DbNull,
                order: i,
              })),
            },
          },
        });
        return this.getMine(userId, created.id);
      } catch (err) {
        // A pass code collision (1 in ~10⁹) — draw another.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          attempt < 3
        )
          continue;
        throw err;
      }
    }
  }

  async getMine(userId: string, bookingId: string) {
    return this.forGuest(await this.loadMine(userId, bookingId));
  }

  /** The user's stays, newest first; optionally for one event. */
  async listMine(userId: string, eventId?: string) {
    const rows = await this.prisma.stayBooking.findMany({
      where: { userId, ...(eventId ? { eventId } : {}) },
      include: BOOKING_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((b) => this.forGuest(b));
  }

  async cancelMine(userId: string, bookingId: string, reason?: string) {
    const b = await this.loadMine(userId, bookingId);
    const cancellable: StayBookingStatus[] = [
      StayBookingStatus.PENDING,
      StayBookingStatus.AWAITING_PAYMENT,
      StayBookingStatus.CONFIRMED,
    ];
    if (!cancellable.includes(b.status))
      throw new BadRequestException('This stay can no longer be cancelled.');
    if (
      b.paymentMode === StayPaymentMode.ONLINE &&
      b.paymentStatus === PaymentStatus.PAID
    ) {
      throw new BadRequestException(
        'You paid for this stay online. Ask the event team to cancel it and refund you.',
      );
    }
    const res = await this.prisma.stayBooking.updateMany({
      where: { id: b.id, status: b.status },
      data: {
        status: StayBookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: userId,
        cancellationReason: reason?.trim() || 'Cancelled by guest',
      },
    });
    if (!res.count)
      throw new ConflictException(
        'This stay just changed. Pull to refresh and try again.',
      );
    return this.getMine(userId, bookingId);
  }

  // ───────────────────────────── payment ─────────────────────────────

  async createOrder(userId: string, bookingId: string) {
    const b = await this.loadMine(userId, bookingId);
    if (
      b.status !== StayBookingStatus.AWAITING_PAYMENT ||
      b.paymentMode !== StayPaymentMode.ONLINE
    ) {
      throw new BadRequestException('This stay has nothing to pay right now.');
    }
    if (b.paymentStatus === PaymentStatus.PAID)
      throw new BadRequestException('This stay is already paid.');
    if (b.paymentDueAt && b.paymentDueAt < new Date()) {
      throw new BadRequestException(
        'The time to pay has run out. Ask the event team to approve you again.',
      );
    }
    const total = num(b.totalAmount);
    const order = await this.payments.createOrder({
      amount: total,
      receipt: `stay_${b.id.slice(0, 8)}_${Date.now()}`,
      notes: { stayBookingId: b.id, eventId: b.eventId, userId },
    });
    await this.prisma.stayBooking.update({
      where: { id: b.id },
      data: { orderId: order.orderId },
    });
    return {
      bookingId: b.id,
      razorpayOrderId: order.orderId,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID!,
      amount: Math.round(total * 100), // paise
      currency: 'INR',
      breakdown: {
        baseAmount: num(b.baseAmount),
        processingFee: num(b.processingFee),
        totalAmount: total,
      },
    };
  }

  async verify(userId: string, bookingId: string, dto: VerifyStayPaymentDto) {
    if (
      !this.payments.verifyPaymentSignature(
        dto.razorpayOrderId,
        dto.razorpayPaymentId,
        dto.razorpaySignature,
      )
    ) {
      throw new BadRequestException('Invalid payment signature');
    }
    const b = await this.loadMine(userId, bookingId);
    // A retry overwrites orderId; an earlier order that got paid still belongs
    // to this booking if its notes say so.
    if (dto.razorpayOrderId !== b.orderId) {
      const notes = await this.payments
        .fetchOrderNotes(dto.razorpayOrderId)
        .catch((): Record<string, string> => ({}));
      if (notes.stayBookingId !== b.id)
        throw new BadRequestException(
          'That payment is for a different booking.',
        );
    }
    await this.settle(b.id, dto.razorpayPaymentId, dto.razorpayOrderId);
    return this.getMine(userId, bookingId);
  }

  /**
   * Called by the Razorpay webhook for a captured payment it couldn't tie to a
   * registration. Returns true when the order was a stay payment.
   */
  async completeFromWebhook(
    orderId: string,
    paymentId: string,
    notes?: Record<string, string>,
  ) {
    let booking = await this.prisma.stayBooking.findFirst({
      where: { orderId },
      select: { id: true },
    });
    if (!booking) {
      let id = notes?.stayBookingId;
      if (!id) {
        try {
          id = (await this.payments.fetchOrderNotes(orderId))?.stayBookingId;
        } catch {
          // not ours, or Razorpay unreachable — the registration path logs it
        }
      }
      if (id)
        booking = await this.prisma.stayBooking.findUnique({
          where: { id },
          select: { id: true },
        });
    }
    if (!booking) return false;
    await this.settle(booking.id, paymentId, orderId);
    return true;
  }

  /**
   * Record a captured payment exactly once (client verify and webhook race).
   * Normally confirms the stay. If the booking expired meanwhile it is
   * confirmed only when beds are still free; otherwise — or if it was
   * cancelled/rejected — the money is refunded in full.
   */
  private async settle(bookingId: string, paymentId: string, orderId: string) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const b = await tx.stayBooking.findUniqueOrThrow({
        where: { id: bookingId },
      });
      await this.lockOption(tx, b.optionId);
      const fresh = await tx.stayBooking.findUniqueOrThrow({
        where: { id: bookingId },
      });
      if (
        fresh.paymentStatus === PaymentStatus.PAID ||
        fresh.paymentStatus === PaymentStatus.REFUNDED
      ) {
        return 'already' as const;
      }
      const paid = {
        paymentStatus: PaymentStatus.PAID,
        paymentId,
        orderId,
        paidAt: new Date(),
      };
      let confirm = fresh.status === StayBookingStatus.AWAITING_PAYMENT;
      if (fresh.status === StayBookingStatus.EXPIRED)
        confirm = !(await this.fits(tx, fresh));
      await tx.stayBooking.update({
        where: { id: bookingId },
        data: confirm
          ? { ...paid, status: StayBookingStatus.CONFIRMED, paymentDueAt: null }
          : paid,
      });
      return confirm ? ('confirmed' as const) : ('refund' as const);
    });

    const b = await this.prisma.stayBooking.findUniqueOrThrow({
      where: { id: bookingId },
      include: BOOKING_INCLUDE,
    });
    if (outcome === 'confirmed') {
      this.notify(
        b.userId,
        b.id,
        'Your stay is confirmed',
        `Your Stay Pass for ${b.stay.name} is ready.`,
      );
    } else if (outcome === 'refund') {
      const total = num(b.totalAmount);
      try {
        await this.payments.refund(paymentId, total);
        await this.prisma.stayBooking.update({
          where: { id: b.id },
          data: {
            paymentStatus: PaymentStatus.REFUNDED,
            refundedAmount: total,
          },
        });
        this.notify(
          b.userId,
          b.id,
          'Stay payment refunded',
          `Your payment for ${b.stay.name} arrived after the booking closed, so ${rupees(total)} is on its way back.`,
        );
      } catch (err) {
        this.logger.error(
          `Stay ${b.id}: late payment ${paymentId} could not be refunded automatically: ${err}`,
        );
      }
    }
  }

  /** Release beds whose payment window closed. */
  @Cron('*/15 * * * *', { timeZone: 'Asia/Kolkata' })
  async expireOverdueCron(): Promise<void> {
    await this.redis.runExclusive('cron:stayExpire', 10 * 60, async () => {
      await this.expireOverdue();
    });
  }

  async expireOverdue(now = new Date()) {
    const due = await this.prisma.stayBooking.findMany({
      where: {
        status: StayBookingStatus.AWAITING_PAYMENT,
        paymentDueAt: { lt: now },
        paymentStatus: { not: PaymentStatus.PAID },
      },
      select: { id: true, userId: true, stay: { select: { name: true } } },
      take: 500,
    });
    for (const b of due) {
      const res = await this.prisma.stayBooking.updateMany({
        where: {
          id: b.id,
          status: StayBookingStatus.AWAITING_PAYMENT,
          paymentStatus: { not: PaymentStatus.PAID },
        },
        data: { status: StayBookingStatus.EXPIRED },
      });
      if (res.count) {
        this.notify(
          b.userId,
          b.id,
          'Stay payment window closed',
          `Your bed at ${b.stay.name} was released because it wasn't paid in time.`,
        );
      }
    }
    return due.length;
  }

  // ───────────────────────────── team ─────────────────────────────

  async listForEvent(eventId: string, q: ListStayBookingsQuery) {
    const search = q.search?.trim();
    const rows = await this.prisma.stayBooking.findMany({
      where: {
        eventId,
        ...(q.status ? { status: q.status } : {}),
        ...(q.stayId ? { stayId: q.stayId } : {}),
        ...(search
          ? {
              OR: [
                { passCode: { contains: search, mode: 'insensitive' } },
                { allocation: { contains: search, mode: 'insensitive' } },
                {
                  guests: {
                    some: { name: { contains: search, mode: 'insensitive' } },
                  },
                },
                { guests: { some: { phone: { contains: search } } } },
                {
                  user: { fullName: { contains: search, mode: 'insensitive' } },
                },
              ],
            }
          : {}),
      },
      include: BOOKING_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((b) => this.forTeam(b));
  }

  async getForEvent(eventId: string, bookingId: string) {
    return this.forTeam(await this.loadForEvent(eventId, bookingId));
  }

  async lookupPass(eventId: string, code: string) {
    const passCode = code.trim().toUpperCase();
    if (!PASS_CODE_RE.test(passCode))
      throw new BadRequestException('That is not a Stay Pass.');
    const b = await this.prisma.stayBooking.findUnique({
      where: { passCode },
      include: BOOKING_INCLUDE,
    });
    if (!b || b.eventId !== eventId)
      throw new NotFoundException('No stay with that pass for this event.');
    return this.forTeam(b);
  }

  async approve(
    eventId: string,
    bookingId: string,
    reviewerId: string,
    dto: ApproveStayBookingDto,
  ) {
    const b = await this.loadForEvent(eventId, bookingId);
    if (b.status !== StayBookingStatus.PENDING)
      throw new BadRequestException('Only new requests can be approved.');

    const next = await this.prisma.$transaction(async (tx) => {
      await this.lockOption(tx, b.optionId);
      const fresh = await tx.stayBooking.findUniqueOrThrow({
        where: { id: bookingId },
      });
      if (fresh.status !== StayBookingStatus.PENDING)
        throw new ConflictException(
          'This request was just handled by someone else.',
        );
      const full = await this.fits(tx, fresh);
      if (full)
        throw new ConflictException(
          `No beds left on the night of ${full}. Free some up or reject this request.`,
        );

      const payOnline =
        fresh.paymentMode === StayPaymentMode.ONLINE &&
        num(fresh.totalAmount) > 0;
      const stay = await tx.stay.findUniqueOrThrow({
        where: { id: fresh.stayId },
        select: { paymentWindowHours: true },
      });
      const status = payOnline
        ? StayBookingStatus.AWAITING_PAYMENT
        : StayBookingStatus.CONFIRMED;
      await tx.stayBooking.update({
        where: { id: bookingId },
        data: {
          status,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
          paymentDueAt: payOnline
            ? new Date(Date.now() + stay.paymentWindowHours * 3600 * 1000)
            : null,
          ...(dto.allocation !== undefined
            ? { allocation: dto.allocation.trim() || null }
            : {}),
        },
      });
      return status;
    });

    const after = await this.loadForEvent(eventId, bookingId);
    if (next === StayBookingStatus.CONFIRMED) {
      const due =
        after.paymentMode === StayPaymentMode.PAY_AT_PROPERTY
          ? ` Pay ${rupees(num(after.totalAmount))} at check-in.`
          : '';
      this.notify(
        after.userId,
        after.id,
        'Your stay is confirmed',
        `Your Stay Pass for ${after.stay.name} is ready.${due}`,
      );
    } else {
      this.notify(
        after.userId,
        after.id,
        'Stay request approved',
        `Pay ${rupees(num(after.totalAmount))} by ${istWhen(after.paymentDueAt!)} to confirm your bed at ${after.stay.name}.`,
      );
    }
    return this.forTeam(after);
  }

  async reject(
    eventId: string,
    bookingId: string,
    reviewerId: string,
    reason?: string,
  ) {
    const b = await this.loadForEvent(eventId, bookingId);
    const rejectable: StayBookingStatus[] = [
      StayBookingStatus.PENDING,
      StayBookingStatus.AWAITING_PAYMENT,
    ];
    if (
      !rejectable.includes(b.status) ||
      b.paymentStatus === PaymentStatus.PAID
    ) {
      throw new BadRequestException(
        'Only requests that are not yet confirmed can be declined. Cancel it instead.',
      );
    }
    const res = await this.prisma.stayBooking.updateMany({
      where: { id: b.id, status: b.status, paymentStatus: b.paymentStatus },
      data: {
        status: StayBookingStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        rejectionReason: reason?.trim() || null,
        paymentDueAt: null,
      },
    });
    if (!res.count)
      throw new ConflictException(
        'This request just changed. Refresh and try again.',
      );
    this.notify(
      b.userId,
      b.id,
      'Stay request declined',
      `${b.stay.name}: ${reason?.trim() || "the event team couldn't fit you in this time."}`,
    );
    return this.getForEvent(eventId, bookingId);
  }

  async update(eventId: string, bookingId: string, dto: UpdateStayBookingDto) {
    await this.loadForEvent(eventId, bookingId);
    await this.prisma.stayBooking.update({
      where: { id: bookingId },
      data: {
        allocation:
          dto.allocation === undefined
            ? undefined
            : dto.allocation?.trim() || null,
        staffNote:
          dto.staffNote === undefined
            ? undefined
            : dto.staffNote?.trim() || null,
      },
    });
    return this.getForEvent(eventId, bookingId);
  }

  /** Pay-at-property money collected by the team. */
  async markPaid(eventId: string, bookingId: string) {
    const b = await this.loadForEvent(eventId, bookingId);
    if (b.paymentMode !== StayPaymentMode.PAY_AT_PROPERTY) {
      throw new BadRequestException(
        'Only pay-at-property stays are marked paid by hand.',
      );
    }
    if (!PASS_STATUSES.includes(b.status))
      throw new BadRequestException('Approve the stay before taking payment.');
    await this.prisma.stayBooking.updateMany({
      where: { id: b.id, paymentStatus: PaymentStatus.PENDING },
      data: { paymentStatus: PaymentStatus.PAID, paidAt: new Date() },
    });
    return this.getForEvent(eventId, bookingId);
  }

  async cancel(
    eventId: string,
    bookingId: string,
    userId: string,
    dto: CancelStayBookingDto,
  ) {
    const b = await this.loadForEvent(eventId, bookingId);
    const cancellable: StayBookingStatus[] = [
      StayBookingStatus.PENDING,
      StayBookingStatus.AWAITING_PAYMENT,
      StayBookingStatus.CONFIRMED,
    ];
    if (!cancellable.includes(b.status))
      throw new BadRequestException('This stay can no longer be cancelled.');

    const paidOnline =
      b.paymentMode === StayPaymentMode.ONLINE &&
      b.paymentStatus === PaymentStatus.PAID;
    if (
      paidOnline &&
      !(await this.authz.can({ id: userId }, Action.EVENT_MANAGE_MONEY, {
        eventId,
      }))
    ) {
      throw new ForbiddenException(
        'Only the curator or a space admin can cancel a stay that was paid online.',
      );
    }

    const claimed = await this.prisma.stayBooking.updateMany({
      where: { id: b.id, status: b.status },
      data: {
        status: StayBookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: userId,
        cancellationReason: dto.reason?.trim() || 'Cancelled by the event team',
        paymentDueAt: null,
      },
    });
    if (!claimed.count)
      throw new ConflictException(
        'This stay just changed. Refresh and try again.',
      );

    let refunded = 0;
    if (paidOnline && dto.refund) {
      // The stay price comes back; the processing fee is kept, as with tickets.
      refunded = Math.max(0, num(b.totalAmount) - num(b.processingFee));
      try {
        await this.payments.refund(b.paymentId!, refunded);
      } catch (err) {
        // Put it back so the team can retry rather than lose track of the money.
        await this.prisma.stayBooking.update({
          where: { id: b.id },
          data: {
            status: b.status,
            cancelledAt: null,
            cancelledById: null,
            cancellationReason: null,
            paymentDueAt: b.paymentDueAt,
          },
        });
        throw new BadRequestException(
          `Razorpay didn't accept the refund: ${razorpayReason(err)}`,
        );
      }
      await this.prisma.stayBooking.update({
        where: { id: b.id },
        data: {
          paymentStatus: PaymentStatus.REFUNDED,
          refundedAmount: refunded,
        },
      });
    }

    this.notify(
      b.userId,
      b.id,
      'Your stay was cancelled',
      `${b.stay.name}: ${dto.reason?.trim() || 'cancelled by the event team'}.${refunded ? ` ${rupees(refunded)} is being refunded (5–7 days).` : ''}`,
    );
    return this.getForEvent(eventId, bookingId);
  }

  async checkIn(eventId: string, bookingId: string, userId: string) {
    const b = await this.loadForEvent(eventId, bookingId);
    if (b.status === StayBookingStatus.CHECKED_IN)
      throw new ConflictException(
        `Already checked in at ${istWhen(b.checkedInAt!)}.`,
      );
    if (b.status !== StayBookingStatus.CONFIRMED)
      throw new BadRequestException('Only confirmed stays can check in.');
    if (
      b.paymentMode === StayPaymentMode.PAY_AT_PROPERTY &&
      b.paymentStatus !== PaymentStatus.PAID
    ) {
      throw new BadRequestException(
        `Collect ${rupees(num(b.totalAmount))} and mark it paid first.`,
      );
    }
    const res = await this.prisma.stayBooking.updateMany({
      where: { id: b.id, status: StayBookingStatus.CONFIRMED },
      data: {
        status: StayBookingStatus.CHECKED_IN,
        checkedInAt: new Date(),
        checkedInById: userId,
      },
    });
    if (!res.count)
      throw new ConflictException(
        'This stay just changed. Refresh and try again.',
      );
    return this.getForEvent(eventId, bookingId);
  }

  async checkOut(eventId: string, bookingId: string) {
    const b = await this.loadForEvent(eventId, bookingId);
    if (b.status !== StayBookingStatus.CHECKED_IN)
      throw new BadRequestException('Only checked-in guests can check out.');
    await this.prisma.stayBooking.updateMany({
      where: { id: b.id, status: StayBookingStatus.CHECKED_IN },
      data: { status: StayBookingStatus.CHECKED_OUT, checkedOutAt: new Date() },
    });
    return this.getForEvent(eventId, bookingId);
  }
}
