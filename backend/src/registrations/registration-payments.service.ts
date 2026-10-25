import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { CacheService } from '../cache/cache.service';
import { PaymentsService, capturedAmountMatches } from '../payments/payments.service';
import { SessionsService } from '../sessions/sessions.service';
import { StayBookingsService } from '../stays/stay-bookings.service';
import { TeamChangesService } from './team-changes.service';
import { takeSeats, SoldOutError } from './capacity.util';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '../redis/redis.service';
import { noteRefundFailure, runRefundRetry } from '../common/refund-alert';
import { CouponsService } from '../coupons/coupons.service';
import {
  PaymentStatus,
  RefundStatus,
  RegistrationStatus,
  Prisma,
  SupportDesk,
  SupportTicketStatus,
  WaitlistStatus,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { updateRefundCase } from '../refunds/refund-cases';
import { esc, h1, strong } from '../email/layout';
import { VerifyPaymentDto, RegistrationResponseDto, AdminResolvePendingDto } from './dto';
import { WaitlistService } from './waitlist.service';
import { GroupSeatsService } from './group-seats.service';
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
import { NotifyService } from '../notifications/notify.service';
import { SubscriptionService } from '../subscription/subscription.service';

/**
 * Settling payments: client verify, the Razorpay webhook, admin reconcile /
 * resolve, and the full refund queued when a ticket sold out mid-payment.
 */
@Injectable()
export class RegistrationPaymentsService {
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
    private readonly stayBookings: StayBookingsService,
    private readonly teamChanges: TeamChangesService,
    private readonly confirmations: RegistrationConfirmationsService,
    private readonly sessions: SessionsService,
    private readonly notify: NotifyService,
    private readonly events?: EventEmitter2,
    // Plan orders ride the same account-wide webhook (T8).
    private readonly subscriptions?: SubscriptionService,
    private readonly redis?: RedisService,
  ) {}

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
      if (amount > 0 && reg.paymentId) await this.payments.refund(reg.paymentId, amount, `auto:reg:${registrationId}`, { registrationId });
    } catch (err) {
      this.logger.error(`CRITICAL: auto-refund of registration ${registrationId} failed, retrying later: ${err}`);
      await noteRefundFailure(this.redis, `auto:reg:${registrationId}`, err);
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
    await runRefundRetry(this.redis, 'registration', async () => {
      const due = await this.prisma.eventRegistration.findMany({
        where: { refundDueAt: { lte: new Date() }, paymentStatus: PaymentStatus.PAID },
        select: { id: true },
        take: 100,
      });
      for (const r of due) await this.refundDue(r.id);
    });
  }

  /**
   * A22: `paymentId` didn't settle this row because another payment already
   * paid it (two tabs on one offer, a retried checkout): refund it in full. A
   * REFUNDED row is left out: it may be a re-registration, so a capture there
   * goes to the orphaned-payments view as before.
   */
  private async refundIfDuplicate(registrationId: string, paymentId: string): Promise<void> {
    const row = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: { paymentId: true, paymentStatus: true },
    });
    if (row?.paymentStatus !== PaymentStatus.PAID && row?.paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED) return;
    await this.payments.refundIfDuplicate(row.paymentId, paymentId, `registration ${registrationId}`);
  }

  /** The verify path never fails the payer over this; the webhook retries it. */
  private refundIfDuplicateQuietly(registrationId: string, paymentId: string): Promise<void> {
    return this.refundIfDuplicate(registrationId, paymentId).catch((err) =>
      this.logger.error(`Duplicate capture ${paymentId} on ${registrationId}: refund failed, webhook will retry: ${err}`),
    );
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
      await this.refundIfDuplicateQuietly(registration.id, dto.razorpayPaymentId);
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
      else await this.refundIfDuplicateQuietly(registration.id, dto.razorpayPaymentId);
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

      // Seats were created with the PENDING row (S42). This only seeds empty
      // seats for a group that somehow has none; idempotent otherwise.
      await this.groupSeats.createSeatsForRegistration(tx, {
        registrationId: registration.id,
        leadUserId: registration.userId,
        seatCount: seats,
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
      await this.refundIfDuplicateQuietly(registration.id, dto.razorpayPaymentId);
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
      include: { tickets: true },
    });

    // Clear Redis order cache
    const client = this.cache['redis'].getClient();
    if (client) {
      await client.del(`order:${dto.razorpayOrderId}`);
    }

    // Only the caller that won the PAID claim above gets here, so this sends once.
    await this.sendPaidConfirmations(registration.id, dto.razorpayPaymentId);

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
   *   3. The order's `notes.registrationId`, always fetched from Razorpay — the
   *      DURABLE identifier that survives payment retries. Never the payment's
   *      own notes: the buyer sets those in Checkout, so trusting them let a
   *      cheap payment settle any registration (A13).
   *
   * Steps 1–2 both key on the *current* orderId, which a retry overwrites: when
   * an attendee pays, abandons, then retries, the captured payment sits on the
   * earlier order while `registration.orderId` now points at the new one — so a
   * late webhook (after the Redis TTL) found nothing and the money went
   * unrecorded. Step 3 closes that gap because order notes never change.
   */
  private async resolveRegistrationIdForOrder(orderId: string): Promise<string | null> {
    const client = this.cache['redis'].getClient();
    const cached = client ? await client.get(`order:${orderId}`) : null;
    if (cached) return cached;

    const byOrder = await this.prisma.eventRegistration.findFirst({
      where: { orderId },
      select: { id: true },
    });
    if (byOrder) return byOrder.id;

    // Durable fallback via the order's notes, fetched from Razorpay (we set them).
    let notesRegId: string | undefined;
    try {
      notesRegId = (await this.payments.fetchOrderNotes(orderId))?.registrationId;
    } catch (err) {
      this.logger.warn(`Could not fetch order notes for ${orderId}: ${err}`);
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
    const paymentData = payload.payload.payment?.entity;

    if (event === 'refund.failed') {
      await this.onRefundFailed(payload.payload.refund.entity);
      return { received: true };
    }
    if (event === 'refund.processed') {
      // Already recorded when the refund was issued; nothing to change.
      return { received: true };
    }

    if (event === 'order.paid') {
      // Only plan orders act on order.paid; everything else settles on payment.captured.
      const order = payload.payload.order?.entity;
      if (order?.notes?.plan && paymentData?.id) {
        await this.subscriptions?.completeFromWebhook(order.id, paymentData.id, order);
      }
      return { received: true };
    }

    if (event === 'payment.captured') {
      const orderId = paymentData.order_id;
      const paymentId = paymentData.id;

      const registrationId = await this.resolveRegistrationIdForOrder(orderId);

      if (!registrationId) {
        // A Unifesto Stay payment rides the same account-wide webhook; its
        // order notes carry `stayBookingId` instead of `registrationId`.
        if (await this.stayBookings.completeFromWebhook(orderId, paymentId, paymentData)) {
          return { received: true };
        }
        // Extra seats bought for a group carry `groupSeatPurchaseId`.
        if (await this.teamChanges.completeFromWebhook(orderId, paymentId, paymentData)) {
          return { received: true };
        }
        // A paid Space session (A16).
        if (await this.sessions.completeFromWebhook(orderId, paymentId, paymentData)) {
          return { received: true };
        }
        // A Space plan order (T8), in case order.paid isn't subscribed.
        if (await this.subscriptions?.completeFromWebhook(orderId, paymentId)) {
          return { received: true };
        }
        this.logger.error(
          `payment.captured: no registration for order ${orderId} (payment ${paymentId}) — captured money is unrecorded. Reconcile via the dashboard.`,
        );
        return { received: true };
      }

      const registration = await this.prisma.eventRegistration.findUnique({
        where: { id: registrationId },
        select: { id: true, paymentStatus: true, status: true, razorpayAmount: true },
      });
      if (!registration) {
        this.logger.error(
          `payment.captured resolved registration ${registrationId} but it no longer exists (order ${orderId})`,
        );
        return { received: true };
      }
      if (
        registration.paymentStatus === PaymentStatus.PAID ||
        registration.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED
      ) {
        // Same payment replayed: idempotent. A different one: refunded (A22).
        await this.refundIfDuplicate(registrationId, paymentId);
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

      if (!capturedAmountMatches(paymentData, registration.razorpayAmount)) {
        this.logger.error(
          `payment.captured ${paymentId} (order ${orderId}) is ${paymentData.amount} ${paymentData.currency}, ` +
            `registration ${registrationId} charges ₹${registration.razorpayAmount} — not settled. Resolve via orphaned payments.`,
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
   * Razorpay accepted a refund and later failed it (A15): the money never left.
   * For a refund request, undo what settling recorded (refundedAmount, payment
   * status) so the amount is refundable again, and move the request to
   * REFUND_FAILED: still owed, held out of payouts, and approvable again to
   * re-send. Seats a full refund released stay released. Runs once per refund
   * id. The attendee and the platform desk are told either way.
   */
  private async onRefundFailed(refund: {
    id: string;
    amount: number;
    payment_id: string;
    notes?: Record<string, string>;
  }) {
    const n = refund.notes ?? {};
    const rupees = Number(refund.amount) / 100;
    if (!n.refundRequestId) {
      // ponytail: auto refunds (sold out, late stay, session/seat/stay cancel)
      // have no request to re-drive; their rows already read REFUNDED (so no
      // payout counts them). The desk re-issues from the Razorpay dashboard.
      this.logger.error(
        `CRITICAL: Razorpay refund ${refund.id} (₹${rupees}, payment ${refund.payment_id}, ${n.refundKey ?? 'no key'}) FAILED: money not returned. Re-issue it from the Razorpay dashboard.`,
      );
      const first = await this.prisma.webhookEvent.createMany({
        data: [{ id: `refund-failed:${refund.id}`, source: 'razorpay' }],
        skipDuplicates: true,
      });
      if (first.count === 1) await this.notifyRefundFailed(refund, rupees, n, false);
      return;
    }
    let first = false;
    let failedCase: { id: string; supportTicketId: string | null } | null = null;
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.webhookEvent.createMany({
        data: [{ id: `refund-failed:${refund.id}`, source: 'razorpay' }],
        skipDuplicates: true,
      });
      if (claimed.count === 0) return;
      first = true;
      const status = (left: unknown) =>
        Number(left) > 0 ? PaymentStatus.PARTIALLY_REFUNDED : PaymentStatus.PAID;
      if (n.groupSeatPurchaseId) {
        const p = await tx.groupSeatPurchase.update({
          where: { id: n.groupSeatPurchaseId },
          data: { refundedAmount: { decrement: rupees } },
        });
        await tx.groupSeatPurchase.update({
          where: { id: p.id },
          data: { paymentStatus: status(p.refundedAmount) },
        });
      } else if (n.registrationId) {
        const r = await tx.eventRegistration.update({
          where: { id: n.registrationId },
          data: { refundedAmount: { decrement: rupees } },
        });
        await tx.eventRegistration.update({
          where: { id: r.id },
          data: { paymentStatus: status(r.refundedAmount) },
        });
      }
      const req = await tx.refundRequest.findUnique({
        where: { id: n.refundRequestId },
        select: { id: true, supportTicketId: true, adminNote: true, status: true },
      });
      if (req) {
        failedCase = req;
        // requestedAmount becomes what is still owed: the payout hold and the
        // re-approve default both read it. A second failed slice adds to it.
        const owed =
          req.status === RefundStatus.REFUND_FAILED
            ? { requestedAmount: { increment: rupees } }
            : { requestedAmount: new Prisma.Decimal(rupees) };
        await tx.refundRequest.update({
          where: { id: n.refundRequestId },
          data: {
            status: RefundStatus.REFUND_FAILED,
            ...owed,
            adminNote: [
              req.adminNote,
              `Razorpay refund ${refund.id} of ₹${rupees} failed: nothing went back. Approve again to re-send.`,
            ]
              .filter(Boolean)
              .join(' '),
          },
        });
      }
    });
    if (!first) return;
    this.logger.error(
      `CRITICAL: refund ${refund.id} (₹${rupees}) for request ${n.refundRequestId} failed at Razorpay; refunded amounts reversed, request REFUND_FAILED`,
    );
    if (failedCase) {
      updateRefundCase(this.events, failedCase, null, `Razorpay couldn't send ₹${rupees} back. Unifesto will send it again.`, {
        status: SupportTicketStatus.OPEN,
        desk: SupportDesk.PLATFORM,
      });
    }
    await this.notifyRefundFailed(refund, rupees, n, true);
  }

  /** Tell the payer and the platform desk that a refund didn't go through. */
  private async notifyRefundFailed(
    refund: { id: string; payment_id: string },
    rupees: number,
    n: Record<string, string>,
    redrivable: boolean,
  ): Promise<void> {
    try {
      const owner = n.groupSeatPurchaseId
        ? await this.prisma.groupSeatPurchase.findUnique({ where: { id: n.groupSeatPurchaseId }, select: { userId: true, event: { select: { title: true } } } })
        : n.registrationId
          ? await this.prisma.eventRegistration.findUnique({ where: { id: n.registrationId }, select: { userId: true, event: { select: { title: true } } } })
          : n.stayBookingId
            ? await this.prisma.stayBooking.findUnique({ where: { id: n.stayBookingId }, select: { userId: true, event: { select: { title: true } } } })
            : n.sessionRegistrationId
              ? await this.prisma.sessionRegistration.findUnique({ where: { id: n.sessionRegistrationId }, select: { userId: true, session: { select: { title: true } } } })
              : null;
      const title = (owner && 'session' in owner ? owner.session?.title : owner?.event?.title) ?? 'your booking';
      const identity = owner?.userId
        ? await this.prisma.userIdentity.findFirst({
            where: { userId: owner.userId, email: { not: null }, isPrimary: true },
            select: { email: true },
          })
        : null;
      if (identity?.email) {
        await this.emailService.sendRawEmail(
          identity.email,
          `Your refund for ${title} didn't go through`,
          h1('Your refund didn’t go through') +
            `<p>Your bank or card network returned the refund of ${strong(`₹${rupees}`)} for ${strong(esc(title))}. Nothing was taken from you, and the money is still owed to you. Our team is re-sending it and will contact you if we need other details.</p>`,
        );
      }
      await this.emailService.sendRawEmail(
        process.env.ADMIN_EMAIL || 'aws@unifesto.app',
        `Refund failed: ₹${rupees} for ${title}`,
        h1('A refund failed at Razorpay') +
          `<p>Refund ${esc(refund.id)} of ${strong(`₹${rupees}`)} on payment ${esc(refund.payment_id)} (${esc(n.refundKey ?? 'no key')}) failed. ${
            redrivable
              ? 'The request is now Refund failed in Apex → Refunds and its amount is held from payouts. Approve it again to re-send.'
              : 'This was an automatic refund: re-issue it from the Razorpay dashboard.'
          }</p>`,
      );
    } catch (err) {
      this.logger.error(`notifyRefundFailed(${refund.id}) failed`, err);
    }
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
      // before touching money state. Only the server-created ORDER's notes
      // count: a payment's own notes are set by the buyer's browser in Checkout
      // and can name any registration (A25, same rule as the webhook in A13).
      let linkedReg: string | undefined;
      if (payment.orderId) {
        try {
          linkedReg = (await this.payments.fetchOrderNotes(payment.orderId)).registrationId;
        } catch {
          // Notes unavailable — refused below as unconfirmable.
        }
      }
      if (payment.currency !== 'INR') {
        throw new BadRequestException(`Payment is in ${payment.currency}, not INR`);
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
        await this.matchReconcileAmount(registration, payment, opts);
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
      // Linked by notes is not enough: the captured amount must be this ticket's.
      await this.matchReconcileAmount(registration, payment, opts);

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
   * The captured amount must equal what this registration charges. An admin who
   * verified the payment really is owed to this attendee can force a mismatch
   * (`allowAmountMismatch`); the row is then re-homed onto the captured amount.
   */
  private async matchReconcileAmount(
    registration: {
      id: string;
      razorpayAmount: Prisma.Decimal;
      totalAmount: Prisma.Decimal;
      processingFee: Prisma.Decimal;
    },
    payment: { id: string; amount: number },
    opts?: { allowAmountMismatch?: boolean },
  ): Promise<void> {
    const registrationId = registration.id;
    const expectedPaise = Math.round(Number(registration.razorpayAmount) * 100);
    if (payment.amount !== expectedPaise) {
      // Amounts differ (a price/fee change, or a genuinely different ticket).
      // Refuse by default so one attendee's payment can't be silently applied
      // to another's ticket. An admin who has verified this payment really is
      // owed to this attendee can override with `allowAmountMismatch`.
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

      // Book what was *actually* captured (T6): `razorpayAmount` becomes the
      // captured value and `totalAmount` moves by the same delta, so both
      // stay cash-accurate. The delta is the organiser's ticket base, never
      // our fee: an over-capture raises the base (and the refundable amount,
      // refunds being base-only); a short one lowers it, and the buyer fee
      // only shrinks once the base is gone. This must run BEFORE settlement:
      // completeWebhookPayment re-reads the row and only writes payment
      // status, so it will honour these amounts rather than overwrite.
      const capturedInr = payment.amount / 100;
      const delta = capturedInr - Number(registration.razorpayAmount);
      // Round to paise to avoid binary-float drift (e.g. 3.0000000001).
      const newTotal = Math.max(0, Math.round((Number(registration.totalAmount) + delta) * 100) / 100);
      const newFee = Math.min(Number(registration.processingFee), newTotal);
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
   * What a settled paid registration sends: the shared confirmation (WhatsApp,
   * ticket email with QR, group invite, push, group member tickets) and the
   * payment receipt through notify() (deduped on the Razorpay payment id).
   * Callers invoke it only after winning the PAID claim, so it runs once per
   * payment. Never throws.
   */
  private async sendPaidConfirmations(registrationId: string, paymentId: string): Promise<void> {
    try {
      await this.confirmations.sendRegistrationConfirmations(registrationId);
      const reg = await this.prisma.eventRegistration.findUnique({
        where: { id: registrationId },
        include: {
          event: true,
          user: true,
          tickets: { where: { attendeeEmail: null }, take: 1, select: { ticketCode: true } },
        },
      });
      if (!reg) return;
      // The receipt (push + email), once per payment. Not awaited: the verify
      // response shouldn't wait on it, and notify() never throws.
      void this.notify.notify(reg.userId, 'payment.confirmed', {
        userName: reg.user.fullName || reg.user.username || 'there',
        eventId: reg.event.id,
        eventSlug: reg.event.slug,
        eventTitle: reg.event.title,
        eventDate: formatEventDate(reg.event.startDateTime),
        eventTime: formatEventTime(reg.event.startDateTime, reg.event.endDateTime),
        venueName: reg.event.venueName || undefined,
        city: reg.event.city || undefined,
        isOnline: reg.event.type === 'ONLINE',
        onlineUrl: reg.event.onlineUrl || undefined,
        amount: Number(reg.totalAmount) - Number(reg.processingFee),
        processingFee: Number(reg.processingFee),
        razorpayPaymentId: paymentId,
        ticketCode: reg.tickets[0]?.ticketCode || undefined,
        qrCode: reg.qrCode,
      });
    } catch (error) {
      this.logger.error(`Failed to send confirmations for registration ${registrationId}`, error);
    }
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
      else await this.refundIfDuplicate(registrationId, paymentId);
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

      // Same as the client-verify path: seats already exist (S42), idempotent.
      await this.groupSeats.createSeatsForRegistration(tx, {
        registrationId: registration.id,
        leadUserId: registration.userId,
        seatCount: seatsFor(registration),
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
      await this.refundIfDuplicate(registrationId, paymentId);
      return;
    }

    // Same as verifyPayment: only the claim winner sends, so the attendee
    // hears once whichever path settled the payment.
    await this.sendPaidConfirmations(registration.id, paymentId);

    // Clear cache
    const client = this.cache['redis'].getClient();
    if (client) {
      await client.del(`order:${orderId}`);
    }

    this.logger.log(`Webhook processed payment for registration ${registrationId}`);
  }
}
