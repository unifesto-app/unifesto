import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CacheService } from '../cache/cache.service';
import { takeSeats } from './capacity.util';
import { CouponsService } from '../coupons/coupons.service';
import {
  PaymentStatus,
  RegistrationStatus,
  Prisma,
  TicketStatus,
  WaitlistStatus,
} from '@prisma/client';
import { GroupSeatsService } from './group-seats.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationEvents } from '../notifications/notifications.constants';
import type { RegistrationUpdateEvent } from '../notifications/notifications.events';
import { HOLDS_SEAT_PAYMENT, generateQRCode, generateTicketCode, seatsFor } from './registration.util';
import { PaymentsService } from '../payments/payments.service';
import { RegistrationAttendeesService } from './registration-attendees.service';

/** Cancelling a registration (attendee or curator) and restoring a cancelled one. */
@Injectable()
export class RegistrationCancellationService {
  // Same log context as before the split, so log searches keep working.
  private readonly logger = new Logger('RegistrationsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly cache: CacheService,
    private readonly events: EventEmitter2,
    private readonly groupSeats: GroupSeatsService,
    private readonly coupons: CouponsService,
    private readonly attendees: RegistrationAttendeesService,
    private readonly payments: PaymentsService,
  ) {}

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
      // Claim the cancel: two overlapping cancels must not both release seats.
      const claimed = await tx.eventRegistration.updateMany({
        where: { id: registration.id, status: { not: RegistrationStatus.CANCELLED } },
        data: {
          status: RegistrationStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: reason?.trim() || defaultReason,
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Registration already cancelled');
      }

      // Release only what this row actually holds — getting this wrong
      // corrupts the counters permanently:
      //   WAITING  holds no seat and is not an attendee, so neither counter
      //            moves; it only leaves the queue.
      //   OFFERED  holds a seat but is not yet an attendee, so the seat comes
      //            back while registeredCount (never incremented) stays put.
      //   unpaid   (PENDING / FAILED checkout) never took a seat or counted, so
      //            nothing comes back; only its coupon reservation is freed.
      const seats = seatsFor(registration);
      const isQueued =
        registration.waitlistStatus === WaitlistStatus.WAITING;
      const isUnconvertedOffer =
        registration.waitlistStatus === WaitlistStatus.OFFERED;
      const isCounted =
        !isQueued &&
        !isUnconvertedOffer &&
        HOLDS_SEAT_PAYMENT.includes(registration.paymentStatus);

      if (!isCounted && !isUnconvertedOffer) {
        await this.coupons.releaseByRegistration(tx, registration.id);
      }

      if (isCounted) {
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

      if (registration.ticketTypeId && (isCounted || isUnconvertedOffer)) {
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

    // An unpaid curator add still has a live Payment Link; close it (A19).
    if (registration.paymentLinkId) {
      await this.payments.cancelPaymentLink(registration.paymentLinkId);
    }


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

    // Only a row whose money is still held (or a free one) comes back. A
    // refunded row's money is gone, and an unpaid one never paid: restoring
    // either would hand out a free ticket.
    if (!HOLDS_SEAT_PAYMENT.includes(registration.paymentStatus) || registration.refundDueAt) {
      throw new BadRequestException(
        'Only a paid or free registration can be restored. A refunded or unpaid one has to register again.',
      );
    }

    const seats = seatsFor(registration);

    await this.prisma.$transaction(async (tx) => {
      // Claim the row so two restores can't both re-take its seats.
      const claimed = await tx.eventRegistration.updateMany({
        where: { id: registration.id, status: RegistrationStatus.CANCELLED },
        data: {
          status: RegistrationStatus.REGISTERED,
          cancelledAt: null,
          cancellationReason: null,
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Only a cancelled registration can be restored');
      }

      // Re-take the seats the cancellation released, atomically against the
      // ticket's capacity (a restore must not oversell either).
      await takeSeats(
        tx,
        registration,
        seats,
        'Restoring this registration would exceed the ticket type’s capacity.',
      );

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
            ticketCode: generateTicketCode(),
            qrCode: generateQRCode(),
          },
        });
      }
    });

    await this.cache.invalidateCheckinCache(eventId);
    this.logger.log(
      `Restored registration ${registration.id} (event ${eventId}) by user ${userId}`,
    );

    return this.attendees.buildRegistrationDetail(eventId, registrationId);
  }
}
