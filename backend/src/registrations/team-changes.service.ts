import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EventStatus,
  GroupLeadTransferStatus,
  GroupPricingMode,
  GroupSeatStatus,
  PaymentStatus,
  Prisma,
  RegistrationStatus,
} from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService, capturedAmountMatches } from '../payments/payments.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GroupSeatsService } from './group-seats.service';
import { takeSeats } from './capacity.util';
import { esc, h1, p, strong } from '../email/layout';

const money = (n: number) => Math.round(n * 100) / 100;

/** Who is acting: the group's lead (bound by the window) or a curator (not). */
export type TeamActor = { by: 'lead'; userId: string } | { by: 'curator'; eventId: string };

/**
 * What adding `seats` costs. Only a PER_PERSON paid ticket charges; a
 * PER_GROUP or free ticket already covers any team size.
 */
export function addSeatsQuote(
  ticketType: { price: Prisma.Decimal | number; groupPricingMode: GroupPricingMode | null },
  seats: number,
  processingFee: (base: number, tickets: number) => number,
): { base: number; fee: number; total: number } {
  const price = Number(ticketType.price);
  if (ticketType.groupPricingMode !== GroupPricingMode.PER_PERSON || price <= 0) {
    return { base: 0, fee: 0, total: 0 };
  }
  const base = money(price * seats);
  const fee = money(processingFee(base, seats));
  return { base, fee, total: money(base + fee) };
}

const REG_SELECT = {
  id: true,
  userId: true,
  eventId: true,
  status: true,
  paymentStatus: true,
  groupSize: true,
  checkedInAt: true,
  ticketTypeId: true,
  ticketType: {
    select: {
      id: true,
      kind: true,
      price: true,
      groupPricingMode: true,
      minGroupSize: true,
      maxGroupSize: true,
      totalQuantity: true,
      soldCount: true,
    },
  },
  event: {
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      endDateTime: true,
      allowTeamChanges: true,
      teamChangesUntil: true,
    },
  },
} satisfies Prisma.EventRegistrationSelect;

type Reg = Prisma.EventRegistrationGetPayload<{ select: typeof REG_SELECT }>;

/**
 * Changing a group after booking: remove a member (the team shrinks and the seat
 * goes back on sale, no refund), add members (free, or paid as its own Razorpay
 * payment on PER_PERSON tickets), and hand the lead to a member.
 *
 * Seat numbers stay 1..N with no gaps, because rosters are positional (member
 * i ↔ seat i+1) and check-ins/certificates store `memberIndex = seatIndex - 1`.
 * Removing seat k renumbers every seat after it, and shifts those stored indexes
 * with it. A lead handover swaps seat 1 with the new lead's seat.
 */
@Injectable()
export class TeamChangesService {
  private readonly logger = new Logger(TeamChangesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly seats: GroupSeatsService,
    private readonly payments: PaymentsService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Loading + authorisation ─────────────────────────────────────────────────

  private async load(registrationId: string, actor: TeamActor): Promise<Reg> {
    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: REG_SELECT,
    });
    if (!reg) throw new NotFoundException('Registration not found');
    if (actor.by === 'curator' && reg.eventId !== actor.eventId) {
      throw new NotFoundException('Registration not found');
    }
    if (actor.by === 'lead' && reg.userId !== actor.userId) {
      throw new ForbiddenException('Only the group lead can change the team');
    }
    if (reg.ticketType?.kind !== 'GROUP' || (reg.groupSize ?? 0) < 1) {
      throw new BadRequestException('This is not a group registration');
    }
    if (reg.status === RegistrationStatus.CANCELLED) {
      throw new BadRequestException('This registration is cancelled');
    }
    if (
      reg.event.status === EventStatus.COMPLETED ||
      reg.event.status === EventStatus.CANCELLED ||
      reg.event.endDateTime.getTime() < Date.now()
    ) {
      throw new BadRequestException('This event has ended, so the team can no longer change');
    }
    if (actor.by === 'lead') await this.seats.assertLeadMayChangeTeam(reg.id, reg.event);
    await this.seats.ensureSeatsForRegistration(reg.id);
    return reg;
  }

  /** Serialise team changes on one group (groupSize and seat numbers). */
  private lockRegistration(tx: Prisma.TransactionClient, registrationId: string) {
    return tx.$queryRaw`SELECT id FROM event_registrations WHERE id = ${registrationId}::uuid FOR UPDATE`;
  }

  /** The group's size floor: never below 2 (it stays a group) or the ticket's minimum. */
  private minSize(reg: Reg) {
    return Math.max(2, reg.ticketType?.minGroupSize ?? 2);
  }

  /**
   * Has this seat's member got anything stored against their member index?
   * A checked-in member or one holding a certificate can't be moved or removed.
   */
  private async seatHasRecords(registrationId: string, seat: { id: string; seatIndex: number }) {
    const memberIndex = seat.seatIndex - 1;
    const [checkins, certs] = await Promise.all([
      this.prisma.eventGroupMemberCheckin.count({
        where: { registrationId, OR: [{ groupSeatId: seat.id }, { memberIndex }] },
      }),
      this.prisma.certificate.count({ where: { registrationId, memberIndex } }),
    ]);
    return checkins + certs > 0;
  }

  // ── State for the app ───────────────────────────────────────────────────────

  /**
   * What the caller may do to this group right now: the lead gets the window,
   * add limits and price, and any open handover; a member gets the handover
   * only when it is addressed to them.
   */
  async getTeamState(registrationId: string, userId: string) {
    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: REG_SELECT,
    });
    if (!reg) throw new NotFoundException('Registration not found');
    const isLead = reg.userId === userId;
    const isMember =
      !isLead &&
      (await this.prisma.groupSeat.count({
        where: { registrationId, claimedByUserId: userId, status: GroupSeatStatus.CLAIMED },
      })) > 0;
    if (!isLead && !isMember) throw new NotFoundException('Registration not found');

    const pending = await this.prisma.groupLeadTransfer.findFirst({
      where: { registrationId, status: GroupLeadTransferStatus.PENDING },
      select: {
        id: true,
        toUserId: true,
        createdAt: true,
        fromUser: { select: { fullName: true, username: true } },
        toUser: { select: { fullName: true, username: true } },
      },
    });
    const name = (u: { fullName: string | null; username: string | null }) => u.fullName || u.username || 'A teammate';
    const leadTransfer =
      pending && (isLead || pending.toUserId === userId)
        ? {
            id: pending.id,
            toMe: pending.toUserId === userId,
            fromName: name(pending.fromUser),
            toName: name(pending.toUser),
            createdAt: pending.createdAt,
          }
        : null;
    if (!isLead) return { isLead, leadTransfer };

    const ended =
      reg.status === RegistrationStatus.CANCELLED ||
      reg.event.status === EventStatus.COMPLETED ||
      reg.event.status === EventStatus.CANCELLED ||
      reg.event.endDateTime.getTime() < Date.now();
    const lockedReason = ended
      ? 'This event has ended, so the team can no longer change.'
      : await this.seats.leadTeamLockReason(reg.id, reg.event);
    const tt = reg.ticketType;
    const size = reg.groupSize ?? 0;
    const room = tt?.totalQuantity == null ? null : Math.max(0, tt.totalQuantity - tt.soldCount);
    const maxAdd = Math.max(0, Math.min(tt?.maxGroupSize != null ? tt.maxGroupSize - size : Infinity, room ?? Infinity));
    const perSeat = tt ? addSeatsQuote(tt, 1, (b, n) => this.payments.computeProcessingFee(b, n)) : null;
    return {
      isLead,
      leadTransfer,
      open: !lockedReason,
      lockedReason,
      until: reg.event.teamChangesUntil,
      groupSize: size,
      minGroupSize: this.minSize(reg),
      maxGroupSize: tt?.maxGroupSize ?? null,
      // How many more seats can be added (null = no limit).
      canAddUpTo: Number.isFinite(maxAdd) ? maxAdd : null,
      addPricePerSeat: perSeat?.base ?? 0,
      addNeedsPayment: (perSeat?.total ?? 0) > 0,
    };
  }

  // ── Remove a member ─────────────────────────────────────────────────────────

  /**
   * Take a seat out of the group: the team shrinks by one, the seat goes back on
   * sale, and nothing is refunded. Any seat but the lead's may go, unless its
   * member has checked in or holds a certificate. Later seats are renumbered.
   */
  async removeSeat(registrationId: string, seatIndex: number, actor: TeamActor) {
    const reg = await this.load(registrationId, actor);
    if (seatIndex === 1) throw new BadRequestException("The lead's own seat can't be removed. Hand over the lead first.");

    const seat = await this.prisma.groupSeat.findUnique({
      where: { registrationId_seatIndex: { registrationId, seatIndex } },
    });
    if (!seat) throw new NotFoundException('That seat is not part of this group');
    if (await this.seatHasRecords(registrationId, seat)) {
      throw new BadRequestException('This member has already checked in or has a certificate, so they can no longer be removed');
    }

    const memberEmail =
      seat.status === GroupSeatStatus.CLAIMED
        ? this.detailsEmail(seat.memberDetails) ||
          (seat.claimedByUserId ? (await this.seats.primaryEmail(seat.claimedByUserId, null))?.toLowerCase() : null)
        : null;

    await this.prisma.$transaction(async (tx) => {
      await this.lockRegistration(tx, registrationId);
      const fresh = await tx.eventRegistration.findUniqueOrThrow({
        where: { id: registrationId },
        select: { groupSize: true },
      });
      if ((fresh.groupSize ?? 0) - 1 < this.minSize(reg)) {
        throw new BadRequestException(`A team needs at least ${this.minSize(reg)} people.`);
      }
      const gone = await tx.groupSeat.deleteMany({
        where: { id: seat.id, status: seat.status, claimedByUserId: seat.claimedByUserId },
      });
      if (gone.count !== 1) throw new BadRequestException('This seat just changed. Refresh and try again.');
      if (memberEmail) {
        await tx.eventTicket.deleteMany({
          where: { registrationId, attendeeEmail: { equals: memberEmail, mode: 'insensitive' } },
        });
      }
      await this.closeGap(tx, registrationId, seatIndex);
      await tx.eventRegistration.update({ where: { id: registrationId }, data: { groupSize: { decrement: 1 } } });
      await this.moveCapacity(tx, reg, -1);
      await GroupSeatsService.cancelPendingLeadTransfer(tx, registrationId);
    });

    this.logger.log(`Seat ${seatIndex} removed from registration ${registrationId} by ${actor.by}`);
    if (memberEmail) {
      this.email
        .sendRawEmail(
          memberEmail,
          `You've been removed from your team for ${reg.event.title}`,
          h1('You were removed from your team') +
            p(`Your team lead or the organiser removed you from your team for ${strong(reg.event.title)}, so your ticket is no longer valid. If you think this is a mistake, contact your team lead.`),
        )
        .catch((err) => this.logger.error(`Removal notice failed to ${memberEmail}`, err));
    }
    return { groupSize: (reg.groupSize ?? 1) - 1 };
  }

  /**
   * Seat `removed` is gone: shift every later seat down by one, and the member
   * indexes stored against them (check-ins, certificates) with it. Seats move in
   * ascending order so the (registration, seatIndex) unique key never collides;
   * the indexes go through negatives for the same reason.
   */
  private async closeGap(tx: Prisma.TransactionClient, registrationId: string, removed: number) {
    const later = await tx.groupSeat.findMany({
      where: { registrationId, seatIndex: { gt: removed } },
      orderBy: { seatIndex: 'asc' },
      select: { id: true, seatIndex: true },
    });
    for (const s of later) {
      await tx.groupSeat.update({ where: { id: s.id }, data: { seatIndex: s.seatIndex - 1 } });
    }
    const after = removed - 1; // memberIndex of the removed seat
    for (const table of ['event_group_member_checkins', 'certificates'] as const) {
      const t = Prisma.raw(`"${table}"`);
      await tx.$executeRaw`UPDATE ${t} SET member_index = -member_index WHERE registration_id = ${registrationId}::uuid AND member_index > ${after}`;
      await tx.$executeRaw`UPDATE ${t} SET member_index = -member_index - 1 WHERE registration_id = ${registrationId}::uuid AND member_index < 0`;
    }
  }

  /**
   * Take (+n) or give back (−n) n places on the ticket type and the event.
   * Taking is atomic against the ticket's capacity: it fails rather than oversell.
   */
  private async moveCapacity(tx: Prisma.TransactionClient, reg: Pick<Reg, 'eventId' | 'ticketTypeId'>, n: number) {
    if (n > 0) return takeSeats(tx, reg, n, 'Not enough seats left on this ticket.');
    if (reg.ticketTypeId) {
      await tx.eventTicketType.update({ where: { id: reg.ticketTypeId }, data: { soldCount: { increment: n } } });
    }
    await tx.event.update({ where: { id: reg.eventId }, data: { registeredCount: { increment: n } } });
  }

  private detailsEmail(md: Prisma.JsonValue): string | null {
    if (!md || typeof md !== 'object' || Array.isArray(md)) return null;
    const e = (md as Record<string, unknown>).email;
    return typeof e === 'string' && e.trim() ? e.trim().toLowerCase() : null;
  }

  // ── Add members ─────────────────────────────────────────────────────────────

  private assertCanGrow(reg: Reg, seats: number) {
    if (!Number.isInteger(seats) || seats < 1 || seats > 20) {
      throw new BadRequestException('Add between 1 and 20 seats at a time.');
    }
    const max = reg.ticketType?.maxGroupSize;
    if (max != null && (reg.groupSize ?? 0) + seats > max) {
      throw new BadRequestException(`A team can have at most ${max} people.`);
    }
  }

  /** Append `seats` OPEN seats and take their capacity, inside the caller's transaction. */
  private async growInTx(tx: Prisma.TransactionClient, reg: Reg, seats: number) {
    await this.lockRegistration(tx, reg.id);
    const fresh = await tx.eventRegistration.findUniqueOrThrow({
      where: { id: reg.id },
      select: { groupSize: true, status: true },
    });
    if (fresh.status === RegistrationStatus.CANCELLED) throw new BadRequestException('This registration is cancelled');
    const size = fresh.groupSize ?? 0;
    const max = reg.ticketType?.maxGroupSize;
    if (max != null && size + seats > max) throw new BadRequestException(`A team can have at most ${max} people.`);
    await this.moveCapacity(tx, reg, seats);
    await tx.groupSeat.createMany({
      data: Array.from({ length: seats }, (_, i) => ({
        registrationId: reg.id,
        seatIndex: size + 1 + i,
        status: GroupSeatStatus.OPEN,
        inviteToken: GroupSeatsService.newToken(),
      })),
    });
    await tx.eventRegistration.update({ where: { id: reg.id }, data: { groupSize: size + seats } });
    return size + seats;
  }

  /**
   * Add seats with nothing to pay: a curator (any ticket, money handled outside
   * the app) or a lead whose ticket doesn't charge per person. A lead on a
   * PER_PERSON paid ticket must use {@link createAddSeatsOrder}.
   */
  async addSeats(registrationId: string, seats: number, actor: TeamActor) {
    const reg = await this.load(registrationId, actor);
    this.assertCanGrow(reg, seats);
    if (actor.by === 'lead') {
      const quote = addSeatsQuote(reg.ticketType!, seats, (b, n) => this.payments.computeProcessingFee(b, n));
      if (quote.total > 0) throw new BadRequestException('New seats on this ticket are paid. Pay for them to add them.');
    }
    const groupSize = await this.prisma.$transaction((tx) => this.growInTx(tx, reg, seats));
    this.logger.log(`Registration ${registrationId} grew by ${seats} (${actor.by})`);
    return { groupSize };
  }

  /** Open a Razorpay order for `seats` extra seats on a PER_PERSON paid ticket. */
  async createAddSeatsOrder(registrationId: string, userId: string, seats: number) {
    const reg = await this.load(registrationId, { by: 'lead', userId });
    this.assertCanGrow(reg, seats);
    const tt = reg.ticketType!;
    if (tt.totalQuantity != null && tt.soldCount + seats > tt.totalQuantity) {
      throw new BadRequestException('Not enough seats left on this ticket.');
    }
    const quote = addSeatsQuote(tt, seats, (b, n) => this.payments.computeProcessingFee(b, n));
    if (quote.total <= 0) throw new BadRequestException('These seats are free. Add them directly.');

    const purchase = await this.prisma.groupSeatPurchase.create({
      data: {
        registrationId,
        eventId: reg.eventId,
        userId,
        seats,
        baseAmount: quote.base,
        processingFee: quote.fee,
        totalAmount: quote.total,
      },
    });
    // Notes carry `groupSeatPurchaseId`, never `registrationId`: the webhook and
    // the orphaned-payments view must not mistake this for the group's own payment.
    const order = await this.payments.createOrder({
      amount: quote.total,
      receipt: `seats_${purchase.id.slice(0, 8)}_${Date.now()}`,
      notes: { groupSeatPurchaseId: purchase.id, eventId: reg.eventId, userId },
    });
    await this.prisma.groupSeatPurchase.update({ where: { id: purchase.id }, data: { orderId: order.orderId } });
    return {
      purchaseId: purchase.id,
      razorpayOrderId: order.orderId,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID!,
      amount: Math.round(quote.total * 100), // paise
      currency: 'INR',
      eventTitle: reg.event.title,
      breakdown: { baseAmount: quote.base, processingFee: quote.fee, totalAmount: quote.total },
    };
  }

  async verifyAddSeats(
    userId: string,
    purchaseId: string,
    dto: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
  ) {
    if (!this.payments.verifyPaymentSignature(dto.razorpayOrderId, dto.razorpayPaymentId, dto.razorpaySignature)) {
      throw new BadRequestException('Invalid payment signature');
    }
    const p = await this.prisma.groupSeatPurchase.findUnique({ where: { id: purchaseId } });
    if (!p || p.userId !== userId) throw new NotFoundException('Payment not found');
    if (p.orderId !== dto.razorpayOrderId) throw new BadRequestException('That payment is for a different order.');
    return this.settle(p.id, dto.razorpayPaymentId);
  }

  /**
   * Razorpay webhook fallback for a captured payment no registration claimed.
   * Returns true when the order was an add-seats payment.
   */
  async completeFromWebhook(
    orderId: string,
    paymentId: string,
    payment: { amount?: unknown; currency?: unknown },
  ) {
    const select = { id: true, totalAmount: true } as const;
    let p = await this.prisma.groupSeatPurchase.findUnique({ where: { orderId }, select });
    if (!p) {
      // Order notes from Razorpay only: payment notes are buyer-set (A13).
      const id = await this.payments
        .fetchOrderNotes(orderId)
        .then((n) => n?.groupSeatPurchaseId)
        .catch(() => undefined);
      if (id) p = await this.prisma.groupSeatPurchase.findUnique({ where: { id }, select });
    }
    if (!p) return false;
    if (!capturedAmountMatches(payment, p.totalAmount)) {
      this.logger.error(
        `payment.captured ${paymentId} (order ${orderId}) is ${payment.amount} ${payment.currency}, ` +
          `seat purchase ${p.id} charges ₹${p.totalAmount} — not settled.`,
      );
      return true;
    }
    await this.settle(p.id, paymentId);
    return true;
  }

  /**
   * Record a captured add-seats payment exactly once (client verify and webhook
   * race). Adds the seats when they still fit; otherwise (group cancelled, team
   * full, ticket sold out) refunds the payment in full and adds nothing.
   */
  private async settle(purchaseId: string, paymentId: string) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.groupSeatPurchase.updateMany({
        where: { id: purchaseId, paymentStatus: PaymentStatus.PENDING },
        data: { paymentStatus: PaymentStatus.PAID, paymentId, paidAt: new Date() },
      });
      if (claimed.count !== 1) return 'already' as const;
      const p = await tx.groupSeatPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
      const reg = await tx.eventRegistration.findUniqueOrThrow({ where: { id: p.registrationId }, select: REG_SELECT });
      try {
        await tx.$executeRaw`SAVEPOINT add_seats`;
        await this.growInTx(tx, reg, p.seats);
        await tx.$executeRaw`RELEASE SAVEPOINT add_seats`;
      } catch (err) {
        if (!(err instanceof BadRequestException)) throw err;
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT add_seats`;
        await tx.groupSeatPurchase.update({ where: { id: purchaseId }, data: { refundDueAt: new Date() } });
        return 'refund' as const;
      }
      await tx.groupSeatPurchase.update({ where: { id: purchaseId }, data: { seatsAddedAt: new Date() } });
      return 'added' as const;
    });

    const p = await this.prisma.groupSeatPurchase.findUniqueOrThrow({
      where: { id: purchaseId },
      include: { registration: { select: { event: { select: { title: true } } } } },
    });
    const title = p.registration.event.title;
    if (outcome === 'added') {
      this.push(p.userId, p.registrationId, 'Seats added', `${p.seats} new seat${p.seats > 1 ? 's are' : ' is'} ready for ${title}. Invite your team.`);
    } else if (outcome === 'refund') {
      await this.refundDue(p.id);
    }
    return { purchaseId, outcome, seats: p.seats };
  }

  /**
   * Send an add-seats payment whose seats couldn't be added back in full.
   * Claimed by pushing `refundDueAt` an hour out, so replicas and retries never
   * refund twice; a failure stays due for {@link retryDueRefunds}.
   */
  async refundDue(purchaseId: string): Promise<boolean> {
    const now = new Date();
    const claimed = await this.prisma.groupSeatPurchase.updateMany({
      where: { id: purchaseId, refundDueAt: { lte: now }, paymentStatus: PaymentStatus.PAID },
      data: { refundDueAt: new Date(now.getTime() + 60 * 60_000) },
    });
    if (claimed.count !== 1) return false;
    const p = await this.prisma.groupSeatPurchase.findUniqueOrThrow({
      where: { id: purchaseId },
      include: { registration: { select: { event: { select: { title: true } } } } },
    });
    const total = Number(p.totalAmount);
    try {
      await this.payments.refund(p.paymentId!, total, `auto:seats:${p.id}`, { groupSeatPurchaseId: p.id });
    } catch (err) {
      this.logger.error(`CRITICAL: add-seats ${p.id} payment ${p.paymentId} couldn't be refunded, retrying later: ${err}`);
      return false;
    }
    await this.prisma.groupSeatPurchase.update({
      where: { id: p.id },
      data: { paymentStatus: PaymentStatus.REFUNDED, refundedAmount: total, refundDueAt: null },
    });
    this.push(p.userId, p.registrationId, 'Seats payment refunded', `The seats couldn't be added for ${p.registration.event.title}, so ₹${total} is on its way back.`);
    return true;
  }

  /** Retry add-seats refunds that didn't go through the first time. */
  @Cron('*/15 * * * *')
  async retryDueRefunds(): Promise<void> {
    const due = await this.prisma.groupSeatPurchase.findMany({
      where: { refundDueAt: { lte: new Date() }, paymentStatus: PaymentStatus.PAID },
      select: { id: true },
      take: 100,
    });
    for (const d of due) await this.refundDue(d.id);
  }

  // ── Hand over the lead ──────────────────────────────────────────────────────

  /** A seat a member holds with their own account (only they can lead). */
  private async memberSeatOrThrow(registrationId: string, seatIndex: number) {
    if (seatIndex === 1) throw new BadRequestException('That seat is already the lead’s.');
    const seat = await this.prisma.groupSeat.findUnique({
      where: { registrationId_seatIndex: { registrationId, seatIndex } },
    });
    if (!seat || seat.status !== GroupSeatStatus.CLAIMED || !seat.claimedByUserId) {
      throw new BadRequestException('Only a member who has claimed their seat with their own account can lead the team.');
    }
    return seat as typeof seat & { claimedByUserId: string };
  }

  /** The lead asks a member to take over; the member accepts or declines. */
  async requestLeadTransfer(registrationId: string, leadUserId: string, seatIndex: number) {
    const reg = await this.load(registrationId, { by: 'lead', userId: leadUserId });
    const seat = await this.memberSeatOrThrow(registrationId, seatIndex);
    let transfer;
    try {
      transfer = await this.prisma.groupLeadTransfer.create({
        data: { registrationId, fromUserId: leadUserId, toUserId: seat.claimedByUserId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('You already asked someone to take over. Cancel that first.');
      }
      throw err;
    }
    const lead = await this.prisma.user.findUnique({ where: { id: leadUserId }, select: { fullName: true, username: true } });
    const leadName = lead?.fullName || lead?.username || 'Your team lead';
    this.push(seat.claimedByUserId, registrationId, 'Lead your team?', `${leadName} wants you to take over as team lead for ${reg.event.title}.`);
    const to = await this.seats.primaryEmail(seat.claimedByUserId, null);
    if (to) {
      this.email
        .sendRawEmail(
          to,
          `${leadName} wants you to lead your team for ${reg.event.title}`,
          h1('Lead your team?') +
            p(`${esc(leadName)} asked you to take over as team lead for ${strong(reg.event.title)}. As lead you manage the team and its booking, including refunds.`) +
            p('Open your ticket in the Unifesto app and go to Manage group to accept or decline.'),
        )
        .catch((err) => this.logger.error(`Lead transfer email failed to ${to}`, err));
    }
    return { id: transfer.id, status: transfer.status };
  }

  /** The lead withdraws their open request. */
  async cancelLeadTransfer(registrationId: string, leadUserId: string) {
    const res = await this.prisma.groupLeadTransfer.updateMany({
      where: { registrationId, fromUserId: leadUserId, status: GroupLeadTransferStatus.PENDING },
      data: { status: GroupLeadTransferStatus.CANCELLED, respondedAt: new Date() },
    });
    if (res.count !== 1) throw new BadRequestException('There is no open request to cancel.');
    return { cancelled: true };
  }

  /** The member addressed by an open request accepts or declines it. */
  async respondLeadTransfer(transferId: string, userId: string, accept: boolean) {
    const t = await this.prisma.groupLeadTransfer.findUnique({ where: { id: transferId } });
    if (!t || t.toUserId !== userId) throw new NotFoundException('Request not found');
    if (t.status !== GroupLeadTransferStatus.PENDING) throw new BadRequestException('This request is no longer open.');

    if (!accept) {
      await this.prisma.groupLeadTransfer.updateMany({
        where: { id: t.id, status: GroupLeadTransferStatus.PENDING },
        data: { status: GroupLeadTransferStatus.DECLINED, respondedAt: new Date() },
      });
      this.push(t.fromUserId, t.registrationId, 'Lead handover declined', 'Your teammate declined to take over as team lead.');
      return { status: GroupLeadTransferStatus.DECLINED };
    }

    // The lead's window still applies at accept time, as the old lead's change.
    const reg = await this.load(t.registrationId, { by: 'lead', userId: t.fromUserId });
    const seat = await this.prisma.groupSeat.findFirst({
      where: { registrationId: reg.id, claimedByUserId: userId, status: GroupSeatStatus.CLAIMED },
    });
    if (!seat) throw new BadRequestException('You no longer hold a seat in this team.');
    await this.performTransfer(reg, seat.seatIndex, t.id);
    this.push(t.fromUserId, reg.id, 'You handed over the lead', `You're now a member of your team for ${reg.event.title}.`);
    return { status: GroupLeadTransferStatus.ACCEPTED };
  }

  /** A curator makes a member the lead directly (no accept step). */
  async curatorTransfer(eventId: string, registrationId: string, seatIndex: number) {
    const reg = await this.load(registrationId, { by: 'curator', eventId });
    const seat = await this.memberSeatOrThrow(registrationId, seatIndex);
    const t = await this.prisma.$transaction(async (tx) => {
      await GroupSeatsService.cancelPendingLeadTransfer(tx, registrationId);
      return tx.groupLeadTransfer.create({
        data: { registrationId, fromUserId: reg.userId, toUserId: seat.claimedByUserId, byCurator: true },
      });
    });
    await this.performTransfer(reg, seatIndex, t.id);
    this.push(seat.claimedByUserId, registrationId, "You're the team lead", `The organiser made you team lead for ${reg.event.title}.`);
    this.push(reg.userId, registrationId, 'Team lead changed', `The organiser handed your team's lead to a teammate for ${reg.event.title}.`);
    return { status: GroupLeadTransferStatus.ACCEPTED };
  }

  /**
   * Swap the lead with the member on `seatIndex`: the registration moves to the
   * member, and their seat becomes seat 1 while the old lead takes theirs. The
   * old lead gets a member ticket stamped with their email (their pass from now
   * on); the new lead's member ticket goes, as the group's own QR is now theirs.
   * Refused if either has checked in or holds a certificate (their member index
   * would no longer match).
   */
  private async performTransfer(reg: Reg, seatIndex: number, transferId: string) {
    const [leadSeat, memberSeat] = await Promise.all([
      this.prisma.groupSeat.findUniqueOrThrow({ where: { registrationId_seatIndex: { registrationId: reg.id, seatIndex: 1 } } }),
      this.prisma.groupSeat.findUniqueOrThrow({ where: { registrationId_seatIndex: { registrationId: reg.id, seatIndex } } }),
    ]);
    if (!memberSeat.claimedByUserId) throw new BadRequestException('That member no longer holds the seat.');
    const newLeadId = memberSeat.claimedByUserId;
    if (
      reg.checkedInAt ||
      (await this.seatHasRecords(reg.id, leadSeat)) ||
      (await this.seatHasRecords(reg.id, memberSeat))
    ) {
      throw new BadRequestException('The lead or this member has already checked in, so the lead can no longer change. Ask the organiser.');
    }
    const [oldEmail, newEmail, oldLead] = await Promise.all([
      this.seats.primaryEmail(reg.userId, null),
      this.seats.primaryEmail(newLeadId, null),
      this.prisma.user.findUnique({ where: { id: reg.userId }, select: { fullName: true, username: true } }),
    ]);

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockRegistration(tx, reg.id);
        const fresh = await tx.eventRegistration.findUniqueOrThrow({ where: { id: reg.id }, select: { userId: true } });
        if (fresh.userId !== reg.userId) throw new BadRequestException('The team lead just changed. Refresh and try again.');
        const moved = await tx.groupSeat.updateMany({
          where: { id: memberSeat.id, seatIndex, claimedByUserId: newLeadId, status: GroupSeatStatus.CLAIMED },
          data: { seatIndex: 0 },
        });
        if (moved.count !== 1) throw new BadRequestException('That seat just changed. Refresh and try again.');
        await tx.groupSeat.update({ where: { id: leadSeat.id }, data: { seatIndex } });
        await tx.groupSeat.update({ where: { id: memberSeat.id }, data: { seatIndex: 1 } });
        // Seat 1 has always carried the lead's account; keep it that way.
        if (!leadSeat.claimedByUserId) {
          await tx.groupSeat.update({ where: { id: leadSeat.id }, data: { claimedByUserId: reg.userId } });
        }
        await tx.eventRegistration.update({ where: { id: reg.id }, data: { userId: newLeadId } });
        if (newEmail) {
          await tx.eventTicket.deleteMany({
            where: { registrationId: reg.id, attendeeEmail: { equals: newEmail, mode: 'insensitive' } },
          });
        }
        await tx.eventTicket.create({
          data: {
            registrationId: reg.id,
            ticketCode: this.seats.ticketCode(),
            qrCode: this.seats.qrCode(),
            attendeeName: oldLead?.fullName || oldLead?.username || null,
            attendeeEmail: oldEmail?.toLowerCase() ?? null,
          },
        });
        const done = await tx.groupLeadTransfer.updateMany({
          where: { id: transferId, status: GroupLeadTransferStatus.PENDING },
          data: { status: GroupLeadTransferStatus.ACCEPTED, respondedAt: new Date() },
        });
        if (done.count !== 1) throw new BadRequestException('This request is no longer open.');
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This member already has their own booking for this ticket, so they can’t lead this team.');
      }
      throw err;
    }
    this.logger.log(`Lead of registration ${reg.id} handed ${reg.userId} → ${newLeadId}`);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private push(userId: string, registrationId: string, title: string, body: string) {
    void this.notifications.send([userId], {
      category: 'registrationUpdates',
      title,
      body,
      deepLink: `unifesto://group/${registrationId}`,
      data: { type: 'group', registrationId },
    }).catch((err) =>
      this.logger.error(`group push(${registrationId}) failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  }
}
