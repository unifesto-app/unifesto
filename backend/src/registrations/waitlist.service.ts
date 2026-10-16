import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { PaymentsService } from '../payments/payments.service';
import { GroupSeatsService } from './group-seats.service';
import { SoldOutError, takeTicketSeats } from './capacity.util';
import { NotificationEvents } from '../notifications/notifications.constants';
import type { WaitlistOfferEvent } from '../notifications/notifications.events';
import {
  PaymentStatus,
  Prisma,
  RegistrationStatus,
  WaitlistStatus,
} from '@prisma/client';
import { assertEventCan } from '../events/event-access';
import { Action, AuthorizationService } from '../auth/authorization';

/**
 * Raised when a spot cannot be offered because the seats are gone.
 *
 * Distinct from every other rejection so batch offering can tell "this one
 * person can't be let in" (skip, keep going) from "the event is full" (stop —
 * everyone behind them will fail identically). Still a 400 to the client.
 */
const OutOfSeatsError = SoldOutError;

/**
 * The waiting list for a sold-out ticket type.
 *
 * Capacity lives on the ticket type (`totalQuantity` / `soldCount`), so the
 * queue that guards it does too — a ticket type opts in with `waitlistEnabled`.
 *
 * Lifecycle of one entry, all on a single `EventRegistration` row:
 *
 *   WAITING   joined a full ticket. Holds no seat.
 *   OFFERED   organiser let them in. The seat is held from this moment, so it
 *             cannot be sold out from under them while they pay. The hold has
 *             no deadline — it lasts until they pay or an organiser revokes it.
 *   CONVERTED paid (or the ticket was free). A normal attendee from here on.
 *   EXPIRED   organiser revoked the unpaid offer — seat released.
 *   DECLINED  turned the offer down — seat released.
 *
 * Reusing the registration row rather than a separate queue table means the
 * group roster, form answers and quantity captured at join time are already in
 * place when the offer converts: nothing is copied, so nothing can drift.
 */
@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly payments: PaymentsService,
    private readonly events: EventEmitter2,
    private readonly groupSeats: GroupSeatsService,
    private readonly authz: AuthorizationService,
  ) {}

  /**
   * Ticket/QR codes for a converted offer. Mirror `RegistrationsService`'s
   * generators so a waiting-list ticket is indistinguishable from one bought
   * through the normal path — same shape, same check-in behaviour.
   */
  private generateTicketCode(): string {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  private generateQRCode(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /** Statuses that occupy a seat in `soldCount`. */
  private static readonly SEAT_HOLDING: WaitlistStatus[] = [
    WaitlistStatus.OFFERED,
    WaitlistStatus.CONVERTED,
  ];

  /**
   * Seats a booking occupies. A group of 5 takes 5 seats, not 1 — mirrors
   * `RegistrationsService.seatsFor`.
   */
  private seatsFor(r: { groupSize?: number | null; quantity: number }): number {
    return r.groupSize && r.groupSize > 0 ? r.groupSize : r.quantity || 1;
  }

  /** Rejects anyone who may not manage the event's attendees. */
  private assertOrganiser(userId: string, eventId: string) {
    return assertEventCan(
      this.prisma,
      this.authz,
      userId,
      eventId,
      Action.EVENT_MANAGE_ATTENDEES,
      'Only the event organisers can manage the waiting list',
      { title: true, startDateTime: true },
    );
  }

  /**
   * Seats left on a ticket type. `null` capacity means unlimited, reported as
   * Infinity so callers can compare without special-casing.
   */
  private seatsAvailable(t: { totalQuantity: number | null; soldCount: number }) {
    if (t.totalQuantity == null) return Number.POSITIVE_INFINITY;
    return Math.max(0, t.totalQuantity - t.soldCount);
  }

  // ---------------------------------------------------------------------------
  // Joining
  // ---------------------------------------------------------------------------

  /**
   * Puts a user in the queue for a full ticket type. Called by the registration
   * paths when they find no seats left and the ticket type has the waiting list
   * switched on.
   *
   * Nothing is charged here, and no price is recorded: the amount is worked out
   * from the ticket's price at the moment a spot is offered, which may be weeks
   * later. Recording it now would quietly lock in a stale price.
   */
  async join(
    userId: string,
    eventId: string,
    ticketTypeId: string,
    input: {
      quantity?: number;
      groupSize?: number | null;
      groupMembers?: unknown;
      formResponses?: unknown;
      qrCode: string;
    },
  ) {
    const [event, ticketType] = await Promise.all([
      this.prisma.event.findUnique({ where: { id: eventId } }),
      this.prisma.eventTicketType.findUnique({ where: { id: ticketTypeId } }),
    ]);
    if (!event) throw new NotFoundException('Event not found');
    if (!ticketType) throw new NotFoundException('Ticket type not found');

    const existing = await this.prisma.eventRegistration.findFirst({
      where: {
        eventId,
        userId,
        ticketTypeId,
        waitlistStatus: {
          in: [WaitlistStatus.WAITING, WaitlistStatus.OFFERED],
        },
      },
    });
    if (existing) {
      throw new BadRequestException(
        'You are already on the waiting list for this ticket',
      );
    }

    const now = new Date();
    const registration = await this.prisma.$transaction(async (tx) => {
      const reg = await tx.eventRegistration.create({
        data: {
          eventId,
          userId,
          ticketTypeId,
          quantity: input.quantity || 1,
          groupSize: input.groupSize ?? null,
          groupMembers:
            (input.groupMembers as Prisma.InputJsonValue) ?? undefined,
          totalAmount: new Prisma.Decimal(0),
          paymentStatus: PaymentStatus.PENDING,
          isWaitlisted: true,
          waitlistStatus: WaitlistStatus.WAITING,
          waitlistedAt: now,
          qrCode: input.qrCode,
          formResponses: (input.formResponses as Prisma.InputJsonValue) || {},
        },
      });

      await tx.event.update({
        where: { id: eventId },
        data: { waitlistCount: { increment: 1 } },
      });

      return reg;
    });

    const position = await this.positionOf(registration.id);

    void this.notifyJoined(userId, event, position).catch((err) =>
      this.logger.error('Failed to send waitlist confirmation email', err),
    );

    return {
      registrationId: registration.id,
      isWaitlisted: true as const,
      waitlistStatus: WaitlistStatus.WAITING,
      position,
      message: `You're number ${position} on the waiting list for ${ticketType.name}.`,
    };
  }

  /**
   * 1-based place in the queue, counted among people still WAITING for the same
   * ticket type and ordered by when they joined.
   *
   * Derived on read rather than stored: a stored position would need every row
   * behind a departure rewritten, and would be wrong the moment that write
   * failed halfway.
   */
  async positionOf(registrationId: string): Promise<number> {
    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: { ticketTypeId: true, waitlistedAt: true },
    });
    if (!reg?.waitlistedAt || !reg.ticketTypeId) return 0;

    const ahead = await this.prisma.eventRegistration.count({
      where: {
        ticketTypeId: reg.ticketTypeId,
        waitlistStatus: WaitlistStatus.WAITING,
        waitlistedAt: { lt: reg.waitlistedAt },
      },
    });
    return ahead + 1;
  }

  // ---------------------------------------------------------------------------
  // Attendee views
  // ---------------------------------------------------------------------------

  /** Every live waiting-list entry for a user, with position and any open offer. */
  async myEntries(userId: string) {
    const rows = await this.prisma.eventRegistration.findMany({
      where: {
        userId,
        waitlistStatus: {
          in: [WaitlistStatus.WAITING, WaitlistStatus.OFFERED],
        },
        status: { not: RegistrationStatus.CANCELLED },
      },
      orderBy: { waitlistedAt: 'asc' },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
            coverImageUrl: true,
            startDateTime: true,
            venueName: true,
            city: true,
          },
        },
        ticketType: {
          select: { id: true, name: true, price: true, currency: true },
        },
      },
    });

    return Promise.all(
      rows.map(async (r) => ({
        registrationId: r.id,
        event: r.event,
        ticketType: r.ticketType,
        waitlistStatus: r.waitlistStatus,
        joinedAt: r.waitlistedAt,
        position:
          r.waitlistStatus === WaitlistStatus.WAITING
            ? await this.positionOf(r.id)
            : null,
        offer:
          r.waitlistStatus === WaitlistStatus.OFFERED
            ? {
                offeredAt: r.waitlistOfferedAt,
                expiresAt: r.waitlistOfferExpiresAt,
                amountDue: Number(r.razorpayAmount),
                totalAmount: Number(r.totalAmount),
                processingFee: Number(r.processingFee),
                needsPayment: Number(r.razorpayAmount) > 0,
              }
            : null,
      })),
    );
  }

  // ---------------------------------------------------------------------------
  // Organiser views
  // ---------------------------------------------------------------------------

  /** The queue for an event, in join order, for the organiser dashboard. */
  async listForEvent(
    organiserId: string,
    eventId: string,
    opts: {
      ticketTypeId?: string;
      status?: WaitlistStatus;
      page?: number;
      limit?: number;
      search?: string;
    } = {},
  ) {
    await this.assertOrganiser(organiserId, eventId);

    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 200) : 50;

    const where: Prisma.EventRegistrationWhereInput = {
      eventId,
      waitlistStatus: opts.status
        ? opts.status
        : { in: [WaitlistStatus.WAITING, WaitlistStatus.OFFERED] },
      ...(opts.ticketTypeId ? { ticketTypeId: opts.ticketTypeId } : {}),
    };

    if (opts.search?.trim()) {
      const term = opts.search.trim();
      where.OR = [
        { user: { fullName: { contains: term, mode: 'insensitive' } } },
        { user: { username: { contains: term, mode: 'insensitive' } } },
        { user: { mobileNumber: { contains: term } } },
        {
          user: {
            identities: {
              some: { email: { contains: term, mode: 'insensitive' } },
            },
          },
        },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.eventRegistration.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { waitlistedAt: 'asc' },
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
            select: {
              id: true,
              name: true,
              price: true,
              currency: true,
              totalQuantity: true,
              soldCount: true,
            },
          },
        },
      }),
      this.prisma.eventRegistration.count({ where }),
    ]);

    return {
      data: rows.map((r, i) => ({
        registrationId: r.id,
        // Rank within this page's ordering; only meaningful for WAITING rows,
        // which is what the unfiltered default view shows first.
        position: (page - 1) * limit + i + 1,
        user: {
          id: r.user.id,
          fullName: r.user.fullName,
          username: r.user.username,
          email: r.user.identities[0]?.email ?? null,
          mobileNumber: r.user.mobileNumber,
          avatarUrl: r.user.avatarUrl,
        },
        ticketType: r.ticketType,
        quantity: r.quantity,
        groupSize: r.groupSize,
        seats: this.seatsFor(r),
        waitlistStatus: r.waitlistStatus,
        joinedAt: r.waitlistedAt,
        offeredAt: r.waitlistOfferedAt,
        offerExpiresAt: r.waitlistOfferExpiresAt,
        amountDue:
          r.waitlistStatus === WaitlistStatus.OFFERED
            ? Number(r.razorpayAmount)
            : null,
        paymentStatus: r.paymentStatus,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Per-ticket-type counts for the dashboard summary strip. */
  async summaryForEvent(organiserId: string, eventId: string) {
    await this.assertOrganiser(organiserId, eventId);

    const ticketTypes = await this.prisma.eventTicketType.findMany({
      where: { eventId },
      select: {
        id: true,
        name: true,
        price: true,
        currency: true,
        totalQuantity: true,
        soldCount: true,
        waitlistEnabled: true,
        waitlistOfferTtlHours: true,
      },
      orderBy: { order: 'asc' },
    });

    const grouped = await this.prisma.eventRegistration.groupBy({
      by: ['ticketTypeId', 'waitlistStatus'],
      where: { eventId, waitlistStatus: { not: null } },
      _count: { _all: true },
    });

    return ticketTypes.map((t) => {
      const countFor = (s: WaitlistStatus) =>
        grouped.find((g) => g.ticketTypeId === t.id && g.waitlistStatus === s)
          ?._count._all ?? 0;

      return {
        ticketTypeId: t.id,
        name: t.name,
        price: Number(t.price),
        currency: t.currency,
        isPaid: Number(t.price) > 0,
        waitlistEnabled: t.waitlistEnabled,
        offerTtlHours: t.waitlistOfferTtlHours,
        capacity: t.totalQuantity,
        soldCount: t.soldCount,
        seatsAvailable:
          t.totalQuantity == null ? null : Math.max(0, t.totalQuantity - t.soldCount),
        waiting: countFor(WaitlistStatus.WAITING),
        offered: countFor(WaitlistStatus.OFFERED),
        converted: countFor(WaitlistStatus.CONVERTED),
        expired: countFor(WaitlistStatus.EXPIRED),
        declined: countFor(WaitlistStatus.DECLINED),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Offering a spot
  // ---------------------------------------------------------------------------

  /**
   * Lets one waiting person in.
   *
   * The seat is claimed here, inside the same transaction that checks it is
   * free — two organisers clicking Allow at the same moment cannot both take
   * the last seat. From this point the seat is held with no deadline: it stays
   * theirs until they pay or an organiser revokes the offer. A free ticket
   * converts immediately with nothing to pay.
   */
  async offer(organiserId: string, eventId: string, registrationId: string) {
    const event = await this.assertOrganiser(organiserId, eventId);

    const result = await this.prisma.$transaction(async (tx) => {
      const reg = await tx.eventRegistration.findUnique({
        where: { id: registrationId },
        include: { ticketType: true },
      });

      if (!reg || reg.eventId !== eventId) {
        throw new NotFoundException('Waiting list entry not found');
      }
      if (reg.waitlistStatus !== WaitlistStatus.WAITING) {
        throw new BadRequestException(
          reg.waitlistStatus === WaitlistStatus.OFFERED
            ? 'This person has already been offered a spot'
            : 'This waiting list entry is no longer active',
        );
      }
      if (!reg.ticketType) {
        throw new BadRequestException(
          'This waiting list entry has no ticket type — the ticket may have been deleted',
        );
      }

      const seats = this.seatsFor(reg);

      // Re-read capacity inside the transaction: the check and the claim must
      // not be separated by anything another request could slip through.
      const ticketType = await tx.eventTicketType.findUnique({
        where: { id: reg.ticketType.id },
        select: { id: true, name: true, price: true, kind: true, groupPricingMode: true, totalQuantity: true, soldCount: true },
      });
      if (!ticketType) throw new NotFoundException('Ticket type not found');

      const available = this.seatsAvailable(ticketType);
      if (available < seats) {
        throw new OutOfSeatsError(
          seats > 1
            ? `Not enough seats free — this group needs ${seats} and only ${available} remain. Cancel or free up seats first.`
            : 'No seats are free right now. A seat must open up before you can let someone in.',
        );
      }

      // Price from the ticket's price *today*, not whatever it was when they
      // joined the queue.
      const unitPrice = Number(ticketType.price);
      const baseAmount =
        ticketType.kind === 'GROUP' && ticketType.groupPricingMode === 'PER_PERSON'
          ? unitPrice * seats
          : ticketType.kind === 'GROUP'
            ? unitPrice
            : unitPrice * reg.quantity;

      const processingFee = this.payments.computeProcessingFee(baseAmount);
      const totalAmount = baseAmount + processingFee;

      const now = new Date();

      // Hold the seat. Note this counts against soldCount but leaves
      // isWaitlisted true — they occupy a seat without being an attendee yet.
      // Atomic: the read above can race a buyer taking the same last seat.
      await takeTicketSeats(tx, ticketType.id, seats, 'No seats are free right now. A seat must open up before you can let someone in.');
      await tx.event.update({
        where: { id: eventId },
        data: { waitlistCount: { decrement: 1 } },
      });

      const updated = await tx.eventRegistration.update({
        where: { id: reg.id },
        data: {
          waitlistStatus: WaitlistStatus.OFFERED,
          waitlistOfferedAt: now,
          // No deadline: the hold lasts until payment or a manual revoke.
          waitlistOfferExpiresAt: null,
          totalAmount: new Prisma.Decimal(totalAmount),
          processingFee: new Prisma.Decimal(processingFee),
          razorpayAmount: new Prisma.Decimal(totalAmount),
          paymentStatus: PaymentStatus.PENDING,
        },
      });

      return {
        reg: updated,
        ticketType,
        totalAmount,
        seats,
      };
    });

    // A free ticket has nothing to pay for — don't make someone sit through a
    // payment step for ₹0.
    if (result.totalAmount === 0) {
      const { registration: converted } = await this.convert(registrationId, {
        paymentId: null,
        orderId: null,
      });
      void this.notifyOffered(result.reg.userId, event, result, true).catch(
        (err) => this.logger.error('Failed to send waitlist offer email', err),
      );
      return {
        registrationId,
        waitlistStatus: WaitlistStatus.CONVERTED,
        needsPayment: false,
        message: 'Spot confirmed — the ticket is free, so nothing is owed.',
        registration: converted,
      };
    }

    void this.notifyOffered(result.reg.userId, event, result, false).catch(
      (err) => this.logger.error('Failed to send waitlist offer email', err),
    );

    return {
      registrationId,
      waitlistStatus: WaitlistStatus.OFFERED,
      needsPayment: true,
      amountDue: result.totalAmount,
      message: `Spot offered. The seat is held until they pay ₹${result.totalAmount} or you revoke the offer.`,
    };
  }

  /**
   * Lets the next `count` people in, in join order. Stops early rather than
   * failing when the seats run out, so "allow 10" on 3 free seats admits 3 and
   * reports the shortfall instead of erroring.
   */
  async offerNext(
    organiserId: string,
    eventId: string,
    ticketTypeId: string,
    count: number,
  ) {
    await this.assertOrganiser(organiserId, eventId);

    const queue = await this.prisma.eventRegistration.findMany({
      where: {
        eventId,
        ticketTypeId,
        waitlistStatus: WaitlistStatus.WAITING,
      },
      orderBy: { waitlistedAt: 'asc' },
      take: Math.max(1, Math.min(count, 100)),
      select: { id: true },
    });

    const offered: string[] = [];
    const skipped: { registrationId: string; reason: string }[] = [];

    for (const row of queue) {
      try {
        await this.offer(organiserId, eventId, row.id);
        offered.push(row.id);
      } catch (err) {
        skipped.push({
          registrationId: row.id,
          reason: err instanceof Error ? err.message : 'Could not offer a spot',
        });
        // Only seat exhaustion is terminal — everyone behind them would fail
        // identically. Any other rejection is specific to this one entry, so
        // keep working down the queue.
        if (err instanceof OutOfSeatsError) break;
      }
    }

    return {
      offeredCount: offered.length,
      requested: count,
      offered,
      skipped,
    };
  }

  // ---------------------------------------------------------------------------
  // Resolving an offer
  // ---------------------------------------------------------------------------

  /**
   * Turns a paid (or free) offer into a real registration: the person stops
   * being waitlisted and their tickets are issued.
   *
   * Self-contained: it always issues the `EventTicket` rows and seeds the group
   * roster itself, so every conversion path — free auto-convert, client verify,
   * webhook — yields an identical, complete registration. It used to depend on
   * the caller passing ticket generators, which the free-ticket path forgot to
   * do, leaving those attendees confirmed but with no ticket to scan.
   *
   * Deliberately does *not* touch `soldCount` — the seat was already claimed
   * when the offer was made. Incrementing here would double-count it.
   */
  /**
   * `converted` is true only for the caller that flipped OFFERED → CONVERTED;
   * a racing loser (verify vs webhook) gets false and must not send the
   * confirmation again.
   */
  async convert(
    registrationId: string,
    payment: { paymentId: string | null; orderId: string | null },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const reg = await tx.eventRegistration.findUnique({
        where: { id: registrationId },
      });
      if (!reg) throw new NotFoundException('Registration not found');
      if (reg.waitlistStatus === WaitlistStatus.CONVERTED) {
        return { registration: reg, converted: false };
      }
      if (reg.waitlistStatus !== WaitlistStatus.OFFERED) {
        throw new BadRequestException(
          'This registration does not have an open waiting list offer',
        );
      }

      // Atomic claim: the client verify and the payment.captured webhook can
      // both read OFFERED above; only the one that flips the row counts the
      // attendee and issues tickets.
      const claimed = await tx.eventRegistration.updateMany({
        // Never revive an offer cancelled meanwhile: the cancel already gave
        // its seat back, so converting it would count an attendee with no seat.
        where: {
          id: registrationId,
          waitlistStatus: WaitlistStatus.OFFERED,
          status: { not: RegistrationStatus.CANCELLED },
        },
        data: {
          waitlistStatus: WaitlistStatus.CONVERTED,
          isWaitlisted: false,
          status: RegistrationStatus.REGISTERED,
          paymentStatus: PaymentStatus.PAID,
          paidAt: new Date(),
          ...(payment.paymentId ? { paymentId: payment.paymentId } : {}),
          ...(payment.orderId ? { orderId: payment.orderId } : {}),
          waitlistOfferExpiresAt: null,
        },
      });
      const updated = await tx.eventRegistration.findUniqueOrThrow({
        where: { id: registrationId },
      });
      if (claimed.count === 0) return { registration: updated, converted: false }; // converted concurrently

      // The seat was held at offer time, so only the event's attendee count
      // moves here.
      await tx.event.update({
        where: { id: reg.eventId },
        data: { registeredCount: { increment: this.seatsFor(reg) } },
      });

      // Issue the physical tickets. Keyed on `quantity` (one shared ticket per
      // booking — a group is quantity 1), matching `completeRSVP`. `existing`
      // guards against a partial prior run so a retry never double-issues.
      const existing = await tx.eventTicket.count({ where: { registrationId } });
      for (let i = existing; i < reg.quantity; i++) {
        await tx.eventTicket.create({
          data: {
            registrationId,
            ticketCode: this.generateTicketCode(),
            qrCode: this.generateQRCode(),
          },
        });
      }

      // Seed the group roster from GroupSeat — the source of truth for group
      // check-in. No-op for solo bookings (seatCount <= 1 returns early) and
      // idempotent (skips if seats already exist), so it is safe on every path.
      await this.groupSeats.createSeatsForRegistration(tx, {
        registrationId,
        leadUserId: reg.userId,
        seatCount: this.seatsFor(reg),
        groupMembers:
          (reg as { groupMembers?: unknown[] | null }).groupMembers ?? null,
      });

      return { registration: updated, converted: true };
    });
  }

  /** Attendee turns down an offer, or leaves the queue before being offered. */
  async decline(userId: string, registrationId: string) {
    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
    });
    if (!reg) throw new NotFoundException('Waiting list entry not found');
    if (reg.userId !== userId) {
      throw new ForbiddenException('This is not your waiting list entry');
    }
    if (
      reg.waitlistStatus !== WaitlistStatus.WAITING &&
      reg.waitlistStatus !== WaitlistStatus.OFFERED
    ) {
      throw new BadRequestException('This waiting list entry is no longer active');
    }
    if (reg.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException(
        'This spot is already paid for — cancel the registration instead',
      );
    }

    await this.releaseSeat(registrationId, WaitlistStatus.DECLINED);

    return { registrationId, waitlistStatus: WaitlistStatus.DECLINED };
  }

  /**
   * Ends a WAITING or OFFERED entry and gives back whatever it was holding: an
   * OFFERED row returns its seat to `soldCount`, a WAITING row (which never had
   * one) just leaves the queue count.
   *
   * Guarded by a conditional `updateMany` so a row already resolved by another
   * path — the attendee paying at the same moment the expiry sweep runs — is
   * left alone rather than having its seat pulled out from under a completed
   * payment.
   */
  private async releaseSeat(registrationId: string, to: WaitlistStatus) {
    return this.prisma.$transaction(async (tx) => {
      const reg = await tx.eventRegistration.findUnique({
        where: { id: registrationId },
      });
      if (!reg?.waitlistStatus) return null;

      const wasHoldingSeat = WaitlistService.SEAT_HOLDING.includes(
        reg.waitlistStatus,
      );

      const { count } = await tx.eventRegistration.updateMany({
        where: {
          id: registrationId,
          waitlistStatus: reg.waitlistStatus,
          paymentStatus: { not: PaymentStatus.PAID },
        },
        data: {
          waitlistStatus: to,
          waitlistOfferExpiresAt: null,
          status: RegistrationStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });

      // Lost the race — the row changed underneath us. Leave its seat alone.
      if (count === 0) return null;

      if (wasHoldingSeat && reg.ticketTypeId) {
        await tx.eventTicketType.update({
          where: { id: reg.ticketTypeId },
          data: { soldCount: { decrement: this.seatsFor(reg) } },
        });
      }
      if (!wasHoldingSeat) {
        await tx.event.update({
          where: { id: reg.eventId },
          data: { waitlistCount: { decrement: 1 } },
        });
      }

      return reg;
    });
  }

  /**
   * Organiser takes back an offer that was never paid for, freeing the held
   * seat so it can go to someone else. This is the only thing that ends an
   * unpaid offer now — there is no timed auto-expiry: a spot stays held until
   * it is either paid for or revoked here.
   *
   * Lands the entry in EXPIRED (not DECLINED — DECLINED means the *attendee*
   * turned it down; this is the organiser withdrawing it). `releaseSeat` guards
   * the seat return against a payment landing in the same instant, so revoking
   * an offer that just got paid is a no-op rather than a double-release.
   */
  async revoke(organiserId: string, eventId: string, registrationId: string) {
    const event = await this.assertOrganiser(organiserId, eventId);

    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: {
        eventId: true,
        userId: true,
        waitlistStatus: true,
        paymentStatus: true,
      },
    });
    if (!reg || reg.eventId !== eventId) {
      throw new NotFoundException('Waiting list entry not found');
    }
    if (reg.waitlistStatus !== WaitlistStatus.OFFERED) {
      throw new BadRequestException(
        'Only an open offer can be revoked — this entry has no seat held for it.',
      );
    }
    if (reg.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException(
        'This spot is already paid for — cancel the registration instead.',
      );
    }

    const released = await this.releaseSeat(
      registrationId,
      WaitlistStatus.EXPIRED,
    );
    // `releaseSeat` returns null when the row moved underneath us — almost
    // always a payment that just converted the offer. Report that plainly
    // rather than pretending the seat came back.
    if (!released) {
      throw new BadRequestException(
        'The offer was just claimed and can no longer be revoked.',
      );
    }

    void this.notifyRevoked(reg.userId, event).catch((err) =>
      this.logger.error('Failed to send waitlist revoked email', err),
    );

    return { registrationId, waitlistStatus: WaitlistStatus.EXPIRED };
  }

  // ---------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------

  private async recipient(userId: string) {
    const [identity, user] = await Promise.all([
      this.prisma.userIdentity.findFirst({
        where: { userId, email: { not: null }, isPrimary: true },
        select: { email: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true, username: true },
      }),
    ]);
    if (!identity?.email || !user) return null;
    return {
      email: identity.email,
      userName: user.fullName || user.username || 'there',
    };
  }

  private formatDate(d: Date, timezone = 'Asia/Kolkata') {
    return new Date(d).toLocaleDateString('en-IN', {
      timeZone: timezone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  private async notifyJoined(
    userId: string,
    event: { id: string; title: string; startDateTime: Date },
    position: number,
  ) {
    const to = await this.recipient(userId);
    if (!to) return;
    await this.email.sendWaitlistConfirmation({
      ...to,
      eventId: event.id,
      eventTitle: event.title,
      eventDate: this.formatDate(event.startDateTime),
      waitlistPosition: position,
    });
  }

  private async notifyRevoked(
    userId: string,
    event: { id: string; title: string; startDateTime: Date },
  ) {
    const to = await this.recipient(userId);
    if (!to) return;

    const full = await this.prisma.event.findUnique({
      where: { id: event.id },
      select: { slug: true, timezone: true },
    });

    await this.email.sendWaitlistRevoked({
      ...to,
      eventId: event.id,
      eventTitle: event.title,
      eventDate: this.formatDate(event.startDateTime, full?.timezone),
      registrationUrl: `${process.env.WEB_URL || ''}/events/${full?.slug ?? event.id}`,
    });
  }

  private async notifyOffered(
    userId: string,
    event: { id: string; title: string; startDateTime: Date },
    offer: { totalAmount: number },
    autoConfirmed: boolean,
  ) {
    const to = await this.recipient(userId);
    if (!to) return;

    const full = await this.prisma.event.findUnique({
      where: { id: event.id },
      select: {
        type: true,
        onlineUrl: true,
        venueName: true,
        city: true,
        slug: true,
        startDateTime: true,
        endDateTime: true,
        timezone: true,
      },
    });

    await this.email.sendWaitlistPromoted({
      ...to,
      eventId: event.id,
      eventTitle: event.title,
      eventDate: this.formatDate(event.startDateTime, full?.timezone),
      eventTime: full
        ? `${new Date(full.startDateTime).toLocaleTimeString('en-IN', {
            timeZone: full.timezone,
            hour: 'numeric',
            minute: '2-digit',
          })} - ${new Date(full.endDateTime).toLocaleTimeString('en-IN', {
            timeZone: full.timezone,
            hour: 'numeric',
            minute: '2-digit',
          })}`
        : '',
      venueName: full?.venueName ?? undefined,
      city: full?.city ?? undefined,
      isOnline: full?.type === 'ONLINE',
      onlineUrl: full?.onlineUrl ?? undefined,
      registrationUrl: `${process.env.WEB_URL || ''}/events/${full?.slug ?? event.id}`,
      amountDue: autoConfirmed ? 0 : offer.totalAmount,
      // No deadline any more — the seat is held until paid for or revoked.
      expiresInHours: null,
    });

    // Offline push (best-effort, decoupled). Auto-confirmed free offers read as
    // a confirmation; paid offers prompt the pay-to-claim.
    this.events.emit(NotificationEvents.WaitlistOffer, {
      userId,
      eventId: event.id,
      eventTitle: event.title,
      eventSlug: full?.slug,
    } satisfies WaitlistOfferEvent);
  }
}
