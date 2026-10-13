import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationEvents } from '../notifications/notifications.constants';
import type { RegistrationUpdateEvent } from '../notifications/notifications.events';
import {
  CreateRefundRequestDto,
  CuratorReviewDto,
  AdminDecisionDto,
  AdminRefundDto,
} from './dto';
import {
  RefundStatus,
  RefundRequesterRole,
  RefundMethod,
  PaymentStatus,
  RegistrationStatus,
  TicketStatus,
  EventStatus,
  Prisma,
} from '@prisma/client';
import { SPACE_ADMIN_ROLE_CODES } from '../auth/authorization';
import { REDACTED_REFUND_REASON } from '../common/account-deletion';
import Razorpay from 'razorpay';
import { esc, h1, small, strong } from '../email/layout';

/** Round to 2 decimal places (money). */
function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Split a refund across the payments behind one booking, in order: the group's
 * own payment first, then each extra-seats payment. Each takes up to its
 * `room` (base still refundable); anything beyond the total room is dropped.
 */
export function allocateRefund<K>(amount: number, buckets: { key: K; room: number }[]): { key: K; amount: number }[] {
  const out: { key: K; amount: number }[] = [];
  let left = money(amount);
  for (const b of buckets) {
    if (left <= 0) break;
    const take = money(Math.min(left, Math.max(0, b.room)));
    if (take > 0) out.push({ key: b.key, amount: take });
    left = money(left - take);
  }
  return out;
}

const OPEN_STATUSES: RefundStatus[] = [
  RefundStatus.PENDING_CURATOR,
  RefundStatus.PENDING_ADMIN,
];

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);
  private readonly razorpay: Razorpay;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly events: EventEmitter2,
  ) {
    // Refunds use standard Razorpay Checkout (payments.refund) — the same
    // integration that collects ticket payments. This is unrelated to RazorpayX.
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
  }

  // --- Money model -----------------------------------------------------------
  // basePrice = totalAmount - processingFee   (ticket price; the only refundable part)
  // Refunds are returned to the original payment method via Razorpay charge-back.
  // The processing fee is never refunded.

  private basePrice(reg: {
    totalAmount: unknown;
    processingFee: unknown;
  }): number {
    return money(Number(reg.totalAmount) - Number(reg.processingFee));
  }

  /**
   * Extra seats bought for this group after booking that are still holding
   * money (a fully refunded one has no base left), oldest first.
   */
  private paidSeatAddons(registrationId: string) {
    return this.prisma.groupSeatPurchase.findMany({
      where: {
        registrationId,
        seatsAddedAt: { not: null },
        paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Refundable base of an extra-seats payment (its processing fee stays). */
  private addonBase(a: { totalAmount: unknown; processingFee: unknown }) {
    return money(Number(a.totalAmount) - Number(a.processingFee));
  }

  /** Ensure the user is an organiser/co-organiser of the event's space. */
  private async assertOrganiser(userId: string, eventId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { spaceId: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    const roles = await this.prisma.userRole.findMany({
      where: {
        userId,
        spaceId: event.spaceId,
        role: { code: { in: [...SPACE_ADMIN_ROLE_CODES] } },
      },
      select: { id: true },
    });
    if (roles.length === 0) {
      throw new ForbiddenException('Not an organiser of this event');
    }
  }

  // --- Notifications --------------------------------------------------------
  // All notification helpers are best-effort: they swallow their own errors so a
  // failed email/push never blocks or reverses the refund decision itself.

  private async userContact(
    userId: string,
  ): Promise<{ name: string; email: string | null; mobile: string | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        fullName: true,
        username: true,
        mobileNumber: true,
        deletedAt: true,
        identities: { where: { email: { not: null } }, select: { email: true }, take: 1 },
      },
    });
    return {
      name: user?.fullName || user?.username || 'there',
      email: user?.identities?.[0]?.email ?? null,
      // A closed account's number is a `deleted-…` placeholder; don't message it.
      mobile: user && !user.deletedAt ? user.mobileNumber : null,
    };
  }

  /** Body fragment; EmailService.sendRawEmail wraps it in the branded layout. */
  private emailHtml(heading: string, body: string): string {
    return h1(esc(heading)) + body;
  }

  private notifyEmail(email: string | null, subject: string, html: string): void {
    if (!email) return;
    this.email
      .sendRawEmail(email, subject, html)
      .catch((err) => this.logger.error(`Refund email failed to ${email}`, err));
  }

  private notifyAdmin(subject: string, html: string): void {
    const adminEmail = process.env.ADMIN_EMAIL || 'aws@unifesto.app';
    this.notifyEmail(adminEmail, subject, html);
  }

  // --- Create ---------------------------------------------------------------

  async createRequest(userId: string, dto: CreateRefundRequestDto) {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: dto.registrationId },
      include: {
        event: {
          select: { id: true, spaceId: true, title: true, createdBy: true, status: true },
        },
      },
    });
    if (!registration) throw new NotFoundException('Registration not found');

    // Determine who is raising the request.
    let requesterRole: RefundRequesterRole;
    let initialStatus: RefundStatus;
    if (registration.userId === userId) {
      requesterRole = RefundRequesterRole.ATTENDEE;
      initialStatus = RefundStatus.PENDING_CURATOR;
    } else {
      // Organisers can raise on an attendee's behalf; this skips their own
      // verification stage and goes straight to admin.
      await this.assertOrganiser(userId, registration.eventId);
      requesterRole = RefundRequesterRole.CURATOR;
      initialStatus = RefundStatus.PENDING_ADMIN;
    }

    // Once the event has ended, attendees can no longer self-request a refund
    // (mirrors the mobile gate). Organiser/admin-raised refunds are left open so
    // post-event disputes and complaints can still be resolved.
    if (
      requesterRole === RefundRequesterRole.ATTENDEE &&
      registration.event?.status === EventStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'This event has ended, so refunds can no longer be requested',
      );
    }

    // Must be a paid registration with base left to refund.
    if (
      registration.paymentStatus !== PaymentStatus.PAID &&
      registration.paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED
    ) {
      throw new BadRequestException('Only paid registrations can be refunded');
    }
    // Free (or ₹0-after-discount) registrations are marked PAID but have no
    // base to refund — say so rather than claiming they were already refunded.
    const addons = await this.paidSeatAddons(registration.id);
    const base = money(this.basePrice(registration) + addons.reduce((s, a) => s + this.addonBase(a), 0));
    if (base <= 0) {
      throw new BadRequestException(
        'This is a free registration, so there is nothing to refund',
      );
    }
    const refunded = Number(registration.refundedAmount) + addons.reduce((s, a) => s + Number(a.refundedAmount), 0);
    const remaining = money(base - refunded);
    if (remaining <= 0) {
      throw new BadRequestException('This registration is already fully refunded');
    }

    // One open request at a time per registration.
    const existing = await this.prisma.refundRequest.findFirst({
      where: { registrationId: dto.registrationId, status: { in: OPEN_STATUSES } },
    });
    if (existing) {
      throw new ConflictException('A refund request is already open for this registration');
    }

    if (dto.requestedAmount != null) {
      const amt = money(dto.requestedAmount);
      if (amt <= 0) throw new BadRequestException('Requested amount must be positive');
      if (amt > remaining) {
        throw new BadRequestException(`Requested amount exceeds the refundable base of ₹${remaining}`);
      }
    }

    const created = await this.prisma.refundRequest.create({
      data: {
        registrationId: dto.registrationId,
        eventId: registration.eventId,
        requestedById: userId,
        requesterRole,
        supportTicketId: dto.supportTicketId ?? null,
        reason: dto.reason,
        requestedAmount: dto.requestedAmount != null ? money(dto.requestedAmount) : null,
        refundMethod: RefundMethod.BANK,
        status: initialStatus,
      },
    });

    const eventTitle = registration.event.title;
    if (requesterRole === RefundRequesterRole.ATTENDEE) {
      // Confirm to the attendee, and alert the organiser to verify.
      const attendee = await this.userContact(registration.userId);
      this.notifyEmail(
        attendee.email,
        `Refund request received: ${eventTitle}`,
        this.emailHtml(
          'We received your refund request',
          `<p>Hi ${esc(attendee.name)}, your refund request for ${strong(eventTitle)} has been sent to the organiser for review. We'll email you once there's an update.</p>`,
        ),
      );
      const organiser = await this.userContact(registration.event.createdBy);
      this.notifyEmail(
        organiser.email,
        `Refund request needs review: ${eventTitle}`,
        this.emailHtml(
          'A refund request needs your review',
          `<p>An attendee requested a refund for ${strong(eventTitle)}.</p><p>Reason: &ldquo;${esc(dto.reason)}&rdquo;</p><p>Review it in the Space dashboard to forward it to Unifesto or reject it.</p>`,
        ),
      );
    } else {
      // Organiser-initiated goes straight to admin.
      this.notifyAdmin(
        `Refund request needs a decision: ${eventTitle}`,
        this.emailHtml(
          'A refund request needs an admin decision',
          `<p>An organiser raised a refund for ${strong(eventTitle)}.</p><p>Reason: &ldquo;${esc(dto.reason)}&rdquo;</p>`,
        ),
      );
    }

    return created;
  }

  // --- Organiser verification -----------------------------------------------

  async curatorReview(userId: string, requestId: string, dto: CuratorReviewDto) {
    const request = await this.prisma.refundRequest.findUnique({
      where: { id: requestId },
      include: {
        registration: { select: { userId: true } },
        event: { select: { title: true } },
      },
    });
    if (!request) throw new NotFoundException('Refund request not found');
    if (request.status !== RefundStatus.PENDING_CURATOR) {
      throw new BadRequestException(`Request is ${request.status}, not awaiting organiser review`);
    }
    await this.assertOrganiser(userId, request.eventId);

    if (dto.action === 'REJECT' && !dto.note?.trim()) {
      throw new BadRequestException('A reason is required to reject a refund request');
    }

    const updated = await this.prisma.refundRequest.update({
      where: { id: requestId },
      data: {
        status: dto.action === 'FORWARD' ? RefundStatus.PENDING_ADMIN : RefundStatus.REJECTED,
        ...(dto.action === 'REJECT' &&
          (await this.reasonOnceDecided(request.registration.userId))),
        curatorNote: dto.note?.trim() || null,
        curatorActionBy: userId,
        curatorActionAt: new Date(),
      },
    });

    const eventTitle = request.event.title;
    if (dto.action === 'FORWARD') {
      this.notifyAdmin(
        `Refund forwarded for decision: ${eventTitle}`,
        this.emailHtml(
          'A refund request needs an admin decision',
          `<p>An organiser verified and forwarded a refund for ${strong(eventTitle)}.</p>${
            dto.note?.trim() ? `<p>Organiser note: &ldquo;${esc(dto.note.trim())}&rdquo;</p>` : ''
          }`,
        ),
      );
    } else {
      const payer = await this.userContact(request.registration.userId);
      this.notifyEmail(
        payer.email,
        `Refund request declined: ${eventTitle}`,
        this.emailHtml(
          'Your refund request was declined',
          `<p>Hi ${esc(payer.name)}, the organiser reviewed your refund request for ${strong(eventTitle)} and was unable to approve it.</p>${
            dto.note?.trim() ? `<p>Reason: &ldquo;${esc(dto.note.trim())}&rdquo;</p>` : ''
          }`,
        ),
      );
      this.events.emit(NotificationEvents.RegistrationUpdate, {
        userId: request.registration.userId,
        eventId: request.eventId,
        eventTitle,
        kind: 'REFUND_DECLINED',
      } satisfies RegistrationUpdateEvent);
    }

    return updated;
  }

  // --- Admin decision -------------------------------------------------------

  async adminDecide(adminId: string, requestId: string, dto: AdminDecisionDto) {
    const request = await this.prisma.refundRequest.findUnique({
      where: { id: requestId },
      include: {
        registration: { include: { event: { select: { title: true } } } },
      },
    });
    if (!request) throw new NotFoundException('Refund request not found');
    if (request.status !== RefundStatus.PENDING_ADMIN) {
      throw new BadRequestException(`Request is ${request.status}, not awaiting admin decision`);
    }

    if (dto.action === 'REJECT') {
      const rejected = await this.prisma.refundRequest.update({
        where: { id: requestId },
        data: {
          status: RefundStatus.REJECTED,
          ...(await this.reasonOnceDecided(request.registration.userId)),
          adminNote: dto.note?.trim() || null,
          adminActionBy: adminId,
          adminActionAt: new Date(),
        },
      });
      const payer = await this.userContact(request.registration.userId);
      this.notifyEmail(
        payer.email,
        `Refund request declined: ${request.registration.event.title}`,
        this.emailHtml(
          'Your refund request was declined',
          `<p>Hi ${esc(payer.name)}, after review your refund request for ${strong(request.registration.event.title)} could not be approved.</p>${
            dto.note?.trim() ? `<p>Reason: &ldquo;${esc(dto.note.trim())}&rdquo;</p>` : ''
          }`,
        ),
      );
      this.events.emit(NotificationEvents.RegistrationUpdate, {
        userId: request.registration.userId,
        eventId: request.registration.eventId,
        eventTitle: request.registration.event.title,
        kind: 'REFUND_DECLINED',
      } satisfies RegistrationUpdateEvent);
      return rejected;
    }

    // APPROVE → issue the refund via the shared settlement path.
    return this.settleApprovedRefund(request, adminId, dto.approvedAmount, dto.note);
  }

  /**
   * Move the money and record the outcome for an approved refund. Shared by the
   * admin's two-stage decision (`adminDecide`) and the admin-initiated refund
   * (`adminRefund`). Refunds the base only, cash-first, and cancels the
   * registration once fully refunded. Assumes the caller has confirmed the
   * request is in a state that may be approved.
   */
  private async settleApprovedRefund(
    request: Prisma.RefundRequestGetPayload<{
      include: { registration: { include: { event: { select: { title: true } } } } };
    }>,
    adminId: string,
    approvedAmount: number | null | undefined,
    note: string | null | undefined,
  ) {
    const requestId = request.id;
    const reg = request.registration;
    const closedReason = await this.reasonOnceDecided(reg.userId);
    // A group may also hold extra-seats payments made after booking; a refund
    // draws on the group's own payment first, then on those, oldest first.
    const addons = await this.paidSeatAddons(reg.id);
    const regBase = this.basePrice(reg);
    const alreadyRefunded = Number(reg.refundedAmount);
    const base = money(regBase + addons.reduce((sum, a) => sum + this.addonBase(a), 0));
    const totalRefunded = money(alreadyRefunded + addons.reduce((sum, a) => sum + Number(a.refundedAmount), 0));
    const maxRefundable = money(base - totalRefunded);
    // A sold-out-mid-payment row is already being refunded in full automatically.
    if (reg.refundDueAt) {
      throw new BadRequestException('This payment is already being refunded in full automatically');
    }
    if (maxRefundable <= 0) {
      throw new BadRequestException('This registration is already fully refunded');
    }

    const amount = approvedAmount != null ? money(approvedAmount) : maxRefundable;
    if (amount <= 0) throw new BadRequestException('Refund amount must be positive');
    if (amount > maxRefundable) {
      throw new BadRequestException(`Maximum refundable base is ₹${maxRefundable}`);
    }

    const plan = allocateRefund<string | null>(amount, [
      { key: null, room: regBase - alreadyRefunded },
      ...addons.map((a) => ({ key: a.id, room: this.addonBase(a) - Number(a.refundedAmount) })),
    ]);
    const regSlice = plan.find((p) => p.key === null)?.amount ?? 0;

    // Refunds return the cash the attendee paid (base minus the non-refundable
    // processing fee), clamped to whatever cash is still refundable across
    // cumulative refunds.
    const cashBaseTotal = money(Number(reg.razorpayAmount) - Number(reg.processingFee));
    const cashRemaining = Math.max(0, money(cashBaseTotal - alreadyRefunded));
    const regCash = money(Math.min(regSlice, cashRemaining));

    // Return the cash portion via Razorpay charge-back to the original payment
    // method. Done before persisting (external/irreversible-ish first).
    let razorpayRefundId: string | null = null;
    if (regCash > 0) {
      if (!reg.paymentId) {
        throw new BadRequestException('No payment id on registration; cannot issue a cash refund');
      }
      try {
        const refund = await this.razorpay.payments.refund(reg.paymentId, {
          amount: Math.round(regCash * 100),
          notes: { registrationId: reg.id, refundRequestId: requestId },
        } as any);
        razorpayRefundId = (refund as any)?.id ?? null;
      } catch (err: any) {
        this.logger.error(`Razorpay refund failed for request ${requestId}`, err);
        throw new BadRequestException(
          err?.error?.description || 'Razorpay refund failed; nothing was charged back',
        );
      }
    }

    // Then each extra-seats payment, against its own Razorpay payment. If one
    // fails, stop: what already went back is recorded, and the rest stays
    // refundable for another request.
    const addonDone: { id: string; amount: number; refundId: string | null; payerId: string }[] = [];
    let shortfall: string | null = null;
    for (const slice of plan.filter((p) => p.key !== null)) {
      const a = addons.find((x) => x.id === slice.key)!;
      try {
        const refund = await this.razorpay.payments.refund(a.paymentId as string, {
          amount: Math.round(slice.amount * 100),
          notes: { groupSeatPurchaseId: a.id, refundRequestId: requestId },
        } as any);
        addonDone.push({ id: a.id, amount: slice.amount, refundId: (refund as any)?.id ?? null, payerId: a.userId });
      } catch (err: any) {
        this.logger.error(`CRITICAL: refund ${requestId}: extra-seats payment ${a.paymentId} refund failed`, err);
        shortfall = err?.error?.description || 'An extra-seats payment could not be refunded';
        break;
      }
    }
    const refundedNow = money(regSlice + addonDone.reduce((sum, d) => sum + d.amount, 0));
    const cashPortion = money(regCash + addonDone.reduce((sum, d) => sum + d.amount, 0));
    const adminNote = [
      note?.trim(),
      shortfall ? `Only ₹${refundedNow} of ₹${amount} went back (${shortfall}). Raise another refund for the rest.` : null,
    ]
      .filter(Boolean)
      .join(' ') || null;

    // Persist: registration totals + (if fully refunded) cancellation, and the request.
    const newRefunded = money(alreadyRefunded + regSlice);
    const fullyRefunded = money(totalRefunded + refundedNow) >= base;

    try {
      await this.prisma.$transaction(async (tx) => {
        // Only a live row still holds seats: a cancelled one (cancelled
        // before this refund, or never seated) already gave them back.
        const holdsSeats = fullyRefunded
          ? (
              await tx.eventRegistration.updateMany({
                where: { id: reg.id, status: { not: RegistrationStatus.CANCELLED } },
                data: { status: RegistrationStatus.CANCELLED, cancelledAt: new Date() },
              })
            ).count === 1
          : false;
        await tx.eventRegistration.update({
          where: { id: reg.id },
          data: {
            refundedAmount: newRefunded,
            paymentStatus: fullyRefunded
              ? PaymentStatus.REFUNDED
              : PaymentStatus.PARTIALLY_REFUNDED,
          },
        });

        for (const d of addonDone) {
          const a = addons.find((x) => x.id === d.id)!;
          const refunded = money(Number(a.refundedAmount) + d.amount);
          await tx.groupSeatPurchase.update({
            where: { id: a.id },
            data: {
              refundedAmount: refunded,
              paymentStatus:
                refunded >= this.addonBase(a) ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED,
              razorpayRefundId: d.refundId,
            },
          });
        }

        if (fullyRefunded) {
          // Release the seats and void tickets, mirroring a cancellation. A
          // group occupies groupSize seats, so release that many (not 1).
          const seats = holdsSeats ? (reg.groupSize ?? reg.quantity) : 0;
          await tx.event.update({
            where: { id: reg.eventId },
            data: { registeredCount: { decrement: seats } },
          });
          if (reg.ticketTypeId) {
            await tx.eventTicketType.update({
              where: { id: reg.ticketTypeId },
              data: { soldCount: { decrement: seats } },
            });
          }
          await tx.eventTicket.updateMany({
            where: { registrationId: reg.id },
            data: { status: TicketStatus.CANCELLED },
          });
        }

        await tx.refundRequest.update({
          where: { id: requestId },
          data: {
            status: RefundStatus.APPROVED,
            ...closedReason,
            adminNote,
            adminActionBy: adminId,
            adminActionAt: new Date(),
            approvedAmount: refundedNow,
            cashRefunded: cashPortion,
            razorpayRefundId,
          },
        });
      });
    } catch (err) {
      // Money already moved but DB write failed — surface loudly for manual repair.
      this.logger.error(
        `CRITICAL: refund ${requestId} settled (cash ₹${cashPortion}, razorpay ${razorpayRefundId}, extra seats ${JSON.stringify(addonDone)}) but DB update failed`,
        err,
      );
      throw err;
    }

    this.logger.log(
      `Refund ${requestId} approved: ₹${refundedNow} (cash ₹${cashPortion})${fullyRefunded ? ' — registration cancelled' : ''}`,
    );

    // The money goes back to the cards it came from. When someone other than
    // today's lead paid (a lead who handed over, or bought extra seats), tell them.
    void this.notifyOtherPayers(reg.id, reg.userId, request.registration.event.title, regCash, addonDone).catch((err) =>
      this.logger.error(`notifyOtherPayers(${reg.id}) failed: ${err instanceof Error ? err.message : String(err)}`),
    );

    const eventTitle = request.registration.event.title;
    const payer = await this.userContact(reg.userId);
    const cashLine =
      cashPortion > 0
        ? `<p>₹${money(cashPortion)} will be refunded to the card or account it was paid with within 5–7 business days.</p>`
        : '';
    this.notifyEmail(
      payer.email,
      `Refund approved: ${eventTitle}`,
      this.emailHtml(
        'Your refund has been approved',
        `<p>Hi ${esc(payer.name)}, your refund of ${strong(`₹${money(refundedNow)}`)} for ${strong(eventTitle)} has been approved.</p>${cashLine}${
          fullyRefunded ? '<p>Your registration has been cancelled.</p>' : ''
        }${small('The booking processing fee is non-refundable.')}`,
      ),
    );
    this.events.emit(NotificationEvents.RegistrationUpdate, {
      userId: reg.userId,
      eventId: reg.eventId,
      eventTitle,
      kind: 'REFUND_APPROVED',
      amount: `₹${money(refundedNow)}`,
    } satisfies RegistrationUpdateEvent);

    return this.prisma.refundRequest.findUnique({ where: { id: requestId } });
  }

  /**
   * Email whoever paid for part of this booking but isn't the lead now: the
   * group's original payer after a lead handover, and the payers of any
   * extra-seats payments refunded here.
   */
  private async notifyOtherPayers(
    registrationId: string,
    leadUserId: string,
    eventTitle: string,
    regCash: number,
    addonDone: { amount: number; payerId: string }[],
  ) {
    try {
      const firstHandover = await this.prisma.groupLeadTransfer.findFirst({
        where: { registrationId, status: 'ACCEPTED' },
        orderBy: { createdAt: 'asc' },
        select: { fromUserId: true },
      });
      const owed = new Map<string, number>();
      if (firstHandover && regCash > 0) owed.set(firstHandover.fromUserId, regCash);
      for (const d of addonDone) owed.set(d.payerId, money((owed.get(d.payerId) ?? 0) + d.amount));
      owed.delete(leadUserId);
      for (const [userId, cash] of owed) {
        const who = await this.userContact(userId);
        this.notifyEmail(
          who.email,
          `A refund is coming back to you: ${eventTitle}`,
          this.emailHtml(
            'A refund is on its way to you',
            `<p>Hi ${esc(who.name)}, your team's booking for ${strong(eventTitle)} was refunded. ₹${cash} goes back to the card or account you paid with, within 5–7 business days.</p>`,
          ),
        );
      }
    } catch (err) {
      this.logger.error(`Refund payer notices failed for registration ${registrationId}`, err);
    }
  }

  // --- Admin-initiated refund -----------------------------------------------

  /**
   * Admin raises and settles a refund in one step, bypassing the
   * attendee→organiser stages. Records the request with requesterRole ADMIN for
   * the audit trail, then settles it immediately through the shared path. Base
   * only, cash-first; the processing fee is never refunded.
   */
  async adminRefund(adminId: string, dto: AdminRefundDto) {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: dto.registrationId },
      select: {
        eventId: true,
        paymentStatus: true,
        totalAmount: true,
        processingFee: true,
        refundedAmount: true,
      },
    });
    if (!registration) throw new NotFoundException('Registration not found');

    if (
      registration.paymentStatus !== PaymentStatus.PAID &&
      registration.paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED
    ) {
      throw new BadRequestException('Only paid registrations can be refunded');
    }
    const addons = await this.paidSeatAddons(dto.registrationId);
    const remaining = money(
      this.basePrice(registration) -
        Number(registration.refundedAmount) +
        addons.reduce((sum, a) => sum + this.addonBase(a) - Number(a.refundedAmount), 0),
    );
    if (remaining <= 0) {
      throw new BadRequestException('This registration is already fully refunded');
    }
    if (dto.approvedAmount != null) {
      const amt = money(dto.approvedAmount);
      if (amt <= 0) throw new BadRequestException('Refund amount must be positive');
      if (amt > remaining) {
        throw new BadRequestException(`Refund amount exceeds the refundable base of ₹${remaining}`);
      }
    }

    // One open request at a time per registration — don't collide with an
    // attendee/organiser request already in flight.
    const existing = await this.prisma.refundRequest.findFirst({
      where: { registrationId: dto.registrationId, status: { in: OPEN_STATUSES } },
    });
    if (existing) {
      throw new ConflictException('A refund request is already open for this registration');
    }

    const request = await this.prisma.refundRequest.create({
      data: {
        registrationId: dto.registrationId,
        eventId: registration.eventId,
        requestedById: adminId,
        requesterRole: RefundRequesterRole.ADMIN,
        reason: dto.reason,
        requestedAmount: dto.approvedAmount != null ? money(dto.approvedAmount) : null,
        status: RefundStatus.PENDING_ADMIN,
      },
      include: { registration: { include: { event: { select: { title: true } } } } },
    });

    return this.settleApprovedRefund(request, adminId, dto.approvedAmount, dto.reason);
  }

  /**
   * Account close leaves a refund still in review its reason so reviewers can
   * decide it; the decision then redacts it. Spread into the deciding update.
   */
  private async reasonOnceDecided(holderId: string): Promise<{ reason?: string }> {
    const holder = await this.prisma.user.findUnique({
      where: { id: holderId },
      select: { deletedAt: true },
    });
    return holder?.deletedAt ? { reason: REDACTED_REFUND_REASON } : {};
  }

  // --- Reads ----------------------------------------------------------------

  async getMyRequests(userId: string, page = 1, limit = 20) {
    return this.paginate({ requestedById: userId }, page, limit);
  }

  /**
   * Requests a curator can act on: PENDING_CURATOR for their events.
   *
   * When `spaceId` is given (the space the operator is currently viewing), the
   * queue is limited to that space's events only. The space is still
   * intersected with the caller's own admin spaces, so passing another space's
   * id can never surface refunds the caller isn't entitled to.
   */
  async getOrganiserRequests(
    userId: string,
    status?: RefundStatus,
    page = 1,
    limit = 20,
    spaceId?: string,
  ) {
    const eventIds = await this.organiserEventIds(userId, spaceId);
    if (eventIds.length === 0) {
      return { requests: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }
    return this.paginate(
      { eventId: { in: eventIds }, ...(status ? { status } : {}) },
      page,
      limit,
    );
  }

  async getAllRequests(status?: RefundStatus, page = 1, limit = 20) {
    return this.paginate(status ? { status } : {}, page, limit);
  }

  async getRequestById(userId: string, id: string) {
    const request = await this.prisma.refundRequest.findUnique({
      where: { id },
      include: {
        registration: {
          include: {
            user: { select: { id: true, fullName: true, username: true } },
            ticketType: { select: { name: true } },
          },
        },
        event: { select: { id: true, title: true, slug: true } },
        requestedBy: { select: { id: true, fullName: true, username: true } },
      },
    });
    if (!request) throw new NotFoundException('Refund request not found');

    // Visible to the attendee/requester, an organiser of the event, or an admin.
    const isOwner =
      request.registration.userId === userId || request.requestedById === userId;
    if (!isOwner) {
      const isAdmin = await this.prisma.userRole.count({
        where: { userId, role: { code: 'ADMIN' } },
      });
      if (!isAdmin) {
        // Throws ForbiddenException if the user isn't an organiser of the event.
        await this.assertOrganiser(userId, request.eventId);
      }
    }
    return request;
  }

  private async organiserEventIds(
    userId: string,
    spaceId?: string,
  ): Promise<string[]> {
    const roles = await this.prisma.userRole.findMany({
      where: {
        userId,
        spaceId: { not: null },
        role: { code: { in: [...SPACE_ADMIN_ROLE_CODES] } },
      },
      select: { spaceId: true },
    });
    let spaceIds = roles.map((r) => r.spaceId).filter((s): s is string => !!s);
    // Narrow to the requested space, but only if the caller actually administers
    // it — an unentitled spaceId collapses the set to empty rather than leaking.
    if (spaceId) {
      spaceIds = spaceIds.filter((s) => s === spaceId);
    }
    if (spaceIds.length === 0) return [];
    const events = await this.prisma.event.findMany({
      where: { spaceId: { in: spaceIds } },
      select: { id: true },
    });
    return events.map((e) => e.id);
  }

  private async paginate(
    where: Prisma.RefundRequestWhereInput,
    page: number,
    limit: number,
  ) {
    const [requests, total] = await Promise.all([
      this.prisma.refundRequest.findMany({
        where,
        include: {
          registration: {
            select: {
              id: true,
              totalAmount: true,
              processingFee: true,
              refundedAmount: true,
              paymentStatus: true,
              user: { select: { id: true, fullName: true, username: true } },
            },
          },
          event: {
            select: {
              id: true,
              title: true,
              slug: true,
              space: { select: { id: true, name: true } },
            },
          },
          requestedBy: { select: { id: true, fullName: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.refundRequest.count({ where }),
    ]);
    return {
      requests,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
