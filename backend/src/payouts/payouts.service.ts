import {
  Injectable, Logger, NotFoundException, Optional,
  BadRequestException, ForbiddenException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlanConfigService } from '../subscription/plan-config.service';
import { feeAtFrozenRates, SETTLE_SELECT, settle, settleRow } from './settle';
import { EmailService } from '../email/email.service';
import { ACCOUNT_NUMBER_RE, AddBankAccountDto, CreatePayoutDto, IFSC_RE, MarkPayoutPaidDto, UPI_RE, UpdateBankAccountStatusDto } from './dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PayoutStatus, BankAccountStatus, PayoutMethodType, PaymentStatus, BillingModel, EventStatus, OrgPlan, RefundStatus, Prisma, StayPaymentMode, SupportCaseKind, SupportDesk, SupportTicketStatus } from '@prisma/client';
import { Action, SPACE_ADMIN_ROLE_CODES } from '../auth/authorization';
import { AuthorizationService } from '../auth/authorization/authorization.service';
import { button, details, esc, greet, h1, inr, note as callout, p, SPACE_APP, strong } from '../email/layout';
import { OPEN_REFUND_STATUSES } from '../refunds/open-statuses';
import { openSubjectCase, updateSubjectCase } from '../support/subject-cases';
import { assertSpaceLive } from '../spaces/space-access';
import { NOT_DEMO_EVENT, NOT_DEMO_SPACE } from '../common/demo-data';

/** Round a rupee figure to 2 dp, avoiding binary float drift in comparisons. */
/** `ab***@okhdfc`: first 2 chars of the handle, full @provider. Only Apex payout execution sees the full VPA. */
export function maskUpiId(upiId: string | null): string | null {
  if (!upiId) return upiId;
  const at = upiId.lastIndexOf('@');
  return `${upiId.slice(0, Math.min(2, at < 0 ? upiId.length : at))}***${at < 0 ? '' : upiId.slice(at)}`;
}

/** A payout's account for a non-admin list: UPI masked, account number cut to its last 4. */
function maskPayoutAccount<P extends { bankAccount: { upiId: string | null; accountNumber: string | null } | null }>(p: P): P {
  if (!p.bankAccount) return p;
  const b = p.bankAccount;
  return { ...p, bankAccount: { ...b, upiId: maskUpiId(b.upiId), accountNumber: b.accountNumber?.slice(-4) ?? null } };
}

/** Masked label for emails: `Asha · HDFC ••••5678` or `Asha · UPI as***@okhdfc`. */
function accountLabel(a: { accountHolderName: string; bankName: string | null; accountNumber: string | null; upiId: string | null }): string {
  return a.upiId
    ? `${a.accountHolderName} · UPI ${maskUpiId(a.upiId)}`
    : `${a.accountHolderName} · ${a.bankName ?? 'Bank'} ••••${(a.accountNumber ?? '').slice(-4)}`;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** The root client or an interactive transaction's: balance reads run in either. */
type Db = Prisma.TransactionClient;

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly authz: AuthorizationService,
    private readonly planConfig: PlanConfigService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  /**
   * D22: a payout account waiting for verification is a REQUEST case on the
   * Platform desk, so "why was it rejected?" is answered in that thread.
   * Opening is idempotent: a review of an account added before D22 opens it then.
   */
  private openBankAccountCase(a: { id: string; userId: string; bankName: string | null; accountNumber: string | null; upiId: string | null }) {
    const ref = a.upiId || `${a.bankName ?? 'Bank'} ••••${(a.accountNumber ?? '').slice(-4)}`;
    openSubjectCase(this.events, {
      subjectType: 'PayoutBankAccount',
      subjectId: a.id,
      requesterId: a.userId,
      kind: SupportCaseKind.REQUEST,
      requestType: 'BANK_ACCOUNT',
      desk: SupportDesk.PLATFORM,
      subject: `Verify payout account ${ref}`,
      message: `Please verify my payout account ${ref}.`,
      notify: true,
    });
  }

  /** Email each user (first identity with an email). Never throws: a mail failure must not undo a money step. */
  private async emailUsers(userIds: string[], subject: string, body: (name: string) => string) {
    try {
      const users = await this.prisma.user.findMany({
        where: { id: { in: [...new Set(userIds)] } },
        select: {
          fullName: true,
          username: true,
          identities: { where: { email: { not: null } }, orderBy: { isPrimary: 'desc' }, take: 1, select: { email: true } },
        },
      });
      await Promise.all(
        users.map(async (u) => {
          const email = u.identities[0]?.email;
          if (email) await this.emailService.sendRawEmail(email, subject, body(u.fullName || u.username || 'there'));
        }),
      );
    } catch (err) {
      this.logger.error(`Payout email "${subject}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * A32: tell the space's payout contacts (the event creator and every Space
   * Admin, the people who may route or request its payouts) when a payout is
   * requested, paid (with the UTR) or cancelled. Platform admins hear about a
   * request through its Assist case (adminAlerts push).
   */
  private async notifyPayoutContacts(payoutId: string, step: 'requested' | 'paid' | 'cancelled') {
    try {
      const payout = await this.prisma.payout.findUnique({
        where: { id: payoutId },
        include: {
          event: { select: { title: true, createdBy: true, spaceId: true } },
          bankAccount: { select: { accountHolderName: true, bankName: true, accountNumber: true, upiId: true } },
        },
      });
      if (!payout) return;
      const recipients = await this.getEligibleAccountUserIds(payout.event);
      const amount = inr(Number(payout.netAmount));
      const title = payout.event.title;
      const facts = details([
        ['Event', esc(title)],
        ['Amount', esc(amount)],
        ['Pay to', esc(accountLabel(payout.bankAccount))],
        ['UTR', step === 'paid' && payout.utr ? esc(payout.utr) : null],
      ]);
      const cta = button('View payouts', `${SPACE_APP}/dashboard/financials?tab=payouts`);
      const copy = {
        requested: {
          subject: `Payout requested for ${title}`,
          head: 'Payout requested',
          line: `We received a payout request of ${strong(amount)} for ${strong(title)}. We transfer it manually and email you the UTR once it is paid.`,
        },
        paid: {
          subject: `Payout sent for ${title}`,
          head: 'Payout sent',
          line: `We transferred ${strong(amount)} for ${strong(title)}. Use the UTR below to match it in your bank statement.`,
        },
        cancelled: {
          subject: `Payout cancelled for ${title}`,
          head: 'Payout cancelled',
          line: `The payout of ${strong(amount)} for ${strong(title)} was cancelled and not paid. The amount is back in the event balance, so you can request it again.`,
        },
      }[step];
      await this.emailUsers([...recipients], copy.subject, (name) => h1(copy.head) + greet(name) + p(copy.line) + facts + cta);
    } catch (err) {
      this.logger.error(`Payout ${payoutId} ${step} email failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** A32: a BANK method or a UPI handle, formats checked again here so no caller skips them. */
  async addBankAccount(userId: string, dto: AddBankAccountDto) {
    const isUpi = dto.methodType === 'UPI';
    const accountNumber = isUpi ? null : (dto.accountNumber ?? '').replace(/\s+/g, '');
    const ifscCode = isUpi ? null : (dto.ifscCode ?? '').trim().toUpperCase();
    const upiId = isUpi ? (dto.upiId ?? '').trim() : null;
    if (isUpi ? !UPI_RE.test(upiId!) : !ACCOUNT_NUMBER_RE.test(accountNumber!) || !IFSC_RE.test(ifscCode!) || !dto.bankName?.trim()) {
      throw new BadRequestException(
        isUpi ? 'Enter a valid UPI ID, like name@okhdfc' : 'Enter a 9 to 18 digit account number, a valid IFSC and the bank name',
      );
    }

    const account = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.payoutBankAccount.updateMany({ where: { userId, isPrimary: true }, data: { isPrimary: false } });
      }
      return tx.payoutBankAccount.create({
        data: {
          userId,
          methodType: isUpi ? PayoutMethodType.UPI : PayoutMethodType.BANK,
          accountHolderName: dto.accountHolderName.trim(),
          mobileNumber: dto.mobileNumber.trim(),
          accountNumber,
          ifscCode,
          bankName: isUpi ? null : dto.bankName!.trim(),
          accountType: dto.accountType || 'savings',
          upiId,
          isPrimary: dto.isPrimary || false,
        },
      });
    });
    this.openBankAccountCase(account);
    return account;
  }

  /** A32: make one of my methods primary. One primary per owner, swapped in one transaction. */
  async setPrimaryBankAccount(userId: string, accountId: string) {
    const account = await this.prisma.payoutBankAccount.findFirst({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundException('Bank account not found');
    if (account.status === BankAccountStatus.REJECTED) {
      throw new BadRequestException('A rejected method cannot be primary');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.payoutBankAccount.updateMany({
        where: { userId, isPrimary: true, id: { not: accountId } },
        data: { isPrimary: false },
      });
      return tx.payoutBankAccount.update({ where: { id: accountId }, data: { isPrimary: true } });
    });
  }

  /**
   * A32: take back a VERIFIED account's verification (back to PENDING, the
   * note shown to its owner). Refused while an unpaid payout points at it, so
   * the admin pays or cancels that first.
   */
  async revokeBankAccountVerification(accountId: string, note: string, adminId: string) {
    const account = await this.prisma.payoutBankAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Bank account not found');
    if (account.status !== BankAccountStatus.VERIFIED) {
      throw new BadRequestException('Only a verified account can be revoked');
    }
    const unpaid = await this.prisma.payout.count({
      where: { bankAccountId: accountId, status: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] } },
    });
    if (unpaid > 0) {
      throw new ConflictException('An unpaid payout goes to this account. Pay or cancel it first.');
    }
    const { count } = await this.prisma.payoutBankAccount.updateMany({
      where: { id: accountId, status: BankAccountStatus.VERIFIED },
      data: { status: BankAccountStatus.PENDING, verifiedAt: null, verifiedBy: null, rejectionReason: note.trim() },
    });
    if (count === 0) throw new ConflictException('This account changed. Reload and try again.');
    this.openBankAccountCase(account);
    updateSubjectCase(this.events, {
      subjectType: 'PayoutBankAccount',
      subjectId: accountId,
      actorId: adminId,
      text: `Unifesto revoked verification of this payout account. Note: ${note.trim()}`,
      status: SupportTicketStatus.PENDING,
    });
    void this.emailUsers([account.userId], 'Your payout account needs a fresh check', (name) =>
      h1('Payout account verification revoked') +
      greet(name) +
      p(`We took back verification of ${strong(accountLabel(account))}. Payouts will not go to it until it is verified again.`) +
      callout(esc(note.trim())) +
      button('View payout methods', `${SPACE_APP}/dashboard/financials?tab=accounts`),
    );
    return this.prisma.payoutBankAccount.findUnique({ where: { id: accountId } });
  }

  async getMyBankAccounts(userId: string) {
    return this.prisma.payoutBankAccount.findMany({
      where: { userId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async deleteBankAccount(userId: string, accountId: string) {
    const account = await this.prisma.payoutBankAccount.findFirst({
      where: { id: accountId, userId },
    });
    if (!account) throw new NotFoundException('Bank account not found');

    // A payout row keeps a required FK to the account it was paid to
    // (`payouts_bank_account_id_fkey`, ON DELETE RESTRICT), so ANY payout —
    // not just in-flight ones — blocks a hard delete. The old guard only
    // counted PENDING/PROCESSING, so an account with a COMPLETED payout slipped
    // through and the delete then failed with a raw 500. Count every payout and
    // return a clear message instead, distinguishing in-flight from historical.
    const [inFlight, total] = await Promise.all([
      this.prisma.payout.count({
        where: {
          bankAccountId: accountId,
          status: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] },
        },
      }),
      this.prisma.payout.count({ where: { bankAccountId: accountId } }),
    ]);
    if (inFlight > 0) {
      throw new BadRequestException('Cannot delete an account with pending payouts');
    }
    if (total > 0) {
      throw new BadRequestException(
        'Cannot delete an account that has payout history. It must be kept for your financial records.',
      );
    }

    // Belt-and-suspenders: a payout could be created between the count and the
    // delete. Translate the FK violation into the same clean 400 rather than a 500.
    try {
      const deleted = await this.prisma.payoutBankAccount.delete({ where: { id: accountId } });
      updateSubjectCase(this.events, {
        subjectType: 'PayoutBankAccount',
        subjectId: accountId,
        actorId: userId,
        text: 'They removed this payout account.',
        status: SupportTicketStatus.CLOSED,
      });
      return deleted;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new BadRequestException(
          'Cannot delete an account that has payout history. It must be kept for your financial records.',
        );
      }
      throw e;
    }
  }

  async updateBankAccountStatus(accountId: string, dto: UpdateBankAccountStatusDto, adminId: string) {
    const account = await this.prisma.payoutBankAccount.findUnique({
      where: { id: accountId },
      include: { user: { include: { identities: { where: { email: { not: null } }, take: 1 } } } },
    });
    if (!account) throw new NotFoundException('Bank account not found');

    const updated = await this.prisma.payoutBankAccount.update({
      where: { id: accountId },
      data: {
        status: dto.status as BankAccountStatus,
        verifiedAt: dto.status === 'VERIFIED' ? new Date() : null,
        verifiedBy: dto.status === 'VERIFIED' ? adminId : null,
        rejectionReason: dto.rejectionReason || null,
      },
    });
    // The emails below tell them, so the case only records it.
    this.openBankAccountCase(account);
    updateSubjectCase(this.events, {
      subjectType: 'PayoutBankAccount',
      subjectId: accountId,
      actorId: adminId,
      text:
        dto.status === 'VERIFIED'
          ? 'Unifesto verified this payout account.'
          : `Unifesto rejected this payout account.${dto.rejectionReason ? ` Reason: ${dto.rejectionReason}` : ''}`,
      status: SupportTicketStatus.RESOLVED,
    });

    // A method may be a bank account or a UPI handle, so build display labels
    // that work for both (bank fields are null on a UPI method).
    const isUpi = account.methodType === PayoutMethodType.UPI;
    const methodLabel = isUpi ? 'UPI' : account.bankName || 'your bank';
    const refLabel = isUpi
      ? account.upiId || account.accountHolderName
      : `****${(account.accountNumber || '').slice(-4)}`;
    const userName = account.user.fullName || account.user.username || 'there';

    // Send rejection email
    if (dto.status === 'REJECTED') {
      const email = account.user.identities[0]?.email;
      if (email) {
        this.emailService
          .sendBankAccountRejected({
            email,
            userName,
            bankName: methodLabel,
            accountNumber: refLabel,
            rejectionReason:
              dto.rejectionReason || 'Verification failed. Please resubmit with correct details.',
          })
          .catch((err) =>
            this.logger.error('Failed to send bank account rejected email', err),
          );
      }
    }

    // Send verified email (optional but good UX)
    if (dto.status === 'VERIFIED') {
      const email = account.user.identities[0]?.email;
      if (email) {
        this.emailService
          .sendRawEmail(
            email,
            'Your payout account is verified',
            h1('Payout account verified') +
              greet(userName) +
              p(`Your ${isUpi ? 'UPI ID' : 'bank account'} ${strong(refLabel)}${isUpi ? '' : ` at ${strong(methodLabel)}`} is verified. Payouts for your events can now reach you.`) +
              button('View payouts', `${SPACE_APP}/dashboard/financials?tab=accounts`),
          )
          .catch((err) =>
            this.logger.error('Failed to send bank account verified email', err),
          );
      }
    }

    return updated;
  }

  /**
   * Platform fee % the organiser pays out of their ticket sales today: the
   * plan rate on SUBSCRIPTION, the space's share on REVENUE_SHARE, 0 on FREE
   * (A9). Each sale is charged the rate frozen on it (A21).
   */
  private resolvePlatformFeePercent(subscription?: {
    billingModel: BillingModel;
    plan: OrgPlan;
    revenueSharePercent: Prisma.Decimal | null;
  } | null): number {
    return this.planConfig.resolvePlatformFeePercent(subscription);
  }

  /**
   * Money the organiser still holds: paid, or partly refunded (counted net of
   * the refund, base-only). A row whose automatic full refund is still due
   * (`refundDueAt`) is not theirs. Registrations and stays carry refundDueAt;
   * seat add-ons don't.
   */
  private readonly HELD_PAYMENT = { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] };
  private readonly HELD = { paymentStatus: this.HELD_PAYMENT, refundDueAt: null };
  private readonly HELD_ADDON = { paymentStatus: this.HELD_PAYMENT };
  private readonly HELD_SUM = { totalAmount: true, processingFee: true, refundedAmount: true } as const;
  private readonly HELD_SELECT = SETTLE_SELECT;

  /**
   * Unifesto Stay bookings paid online (through Razorpay) are event money like
   * tickets: same shape (totalAmount includes the processing fee the platform
   * keeps). Pay-at-property money never reaches the platform and is excluded.
   */
  private paidStayBookings(eventId: string, db: Db = this.prisma) {
    return db.stayBooking.findMany({
      where: {
        eventId,
        paymentMode: StayPaymentMode.ONLINE,
        ...this.HELD,
      },
      select: this.HELD_SELECT,
    });
  }

  /**
   * Extra group seats bought after booking (their own Razorpay payment). Only
   * purchases that actually added seats count: a late payment that was
   * refunded in full never did, and nets to zero.
   */
  private readonly ADDON_ADDED = { seatsAddedAt: { not: null } } satisfies Prisma.GroupSeatPurchaseWhereInput;

  private paidSeatAddons(eventId: string, db: Db = this.prisma) {
    return db.groupSeatPurchase.findMany({
      where: { eventId, ...this.HELD_ADDON, ...this.ADDON_ADDED },
      select: this.HELD_SELECT,
    });
  }

  /** Payout statuses that hold (commit) part of an event's balance. */
  private readonly COMMITTING_STATUSES = [
    PayoutStatus.PENDING,
    PayoutStatus.PROCESSING,
    PayoutStatus.COMPLETED,
  ];

  /**
   * An event's payout balance: the organiser's net entitlement (ticket revenue
   * minus the platform fee) and how much of it is still available after
   * subtracting every payout that is pending, processing or already paid.
   *
   * `available` is the ceiling for any new payout — it is what lets a single
   * event be paid out in several custom chunks without ever over-paying.
   * `overdrawn` is how far payouts already exceed the entitlement (refunds
   * that landed after a payout); `available` alone would hide it as 0.
   */
  private async computeBalance(eventId: string, db: Db = this.prisma) {
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { status: true, space: { select: { subscription: true } } },
    });

    const [registrations, stays, addons] = await Promise.all([
      db.eventRegistration.findMany({
        where: { eventId, ...this.HELD },
        select: this.HELD_SELECT,
      }),
      this.paidStayBookings(eventId, db),
      this.paidSeatAddons(eventId, db),
    ]);

    // Today's rate: shown as the default, and charged only on a sale that has
    // no frozen rate (none after the A21 backfill). Each sale's own terms are
    // the only rate (T6): no per-payout override.
    const platformFeePercent = this.resolvePlatformFeePercent(event?.space?.subscription);
    const { gross, platformFee, net: eventNet } = settle(
      [...registrations, ...stays, ...addons],
      platformFeePercent,
    );

    const committedRows = await db.payout.findMany({
      where: { eventId, status: { in: this.COMMITTING_STATUSES } },
      select: { netAmount: true },
    });
    const committed = committedRows.reduce(
      (sum, p) => sum + Number(p.netAmount),
      0,
    );

    // Open refund requests are owed to attendees: hold them back from what can
    // be withdrawn (A25). An unsized request holds the booking's whole base.
    const openRefunds = await db.refundRequest.findMany({
      where: { eventId, status: { in: OPEN_REFUND_STATUSES } },
      select: {
        requestedAmount: true,
        registration: { select: this.HELD_SELECT },
      },
    });
    const refundHold = openRefunds.reduce(
      (sum, r) =>
        sum +
        (r.requestedAmount != null
          ? Number(r.requestedAmount)
          : settleRow(r.registration, 0).base),
      0,
    );
    // A refund takes its share of the fee back with it, so it holds only the
    // organiser's kept share of the refunded amount.
    const keptShare = gross > 0 ? eventNet / gross : 1;
    const netAfterHold = Math.max(0, eventNet - Math.min(refundHold, gross) * keptShare);

    // A cancelled event owes its paid attendees first (A24): nothing is
    // withdrawable while any money is still held for them.
    const cancelledWithPaid = event?.status === EventStatus.CANCELLED && gross > 0;
    const available = cancelledWithPaid ? 0 : Math.max(0, netAfterHold - committed);
    return {
      cancelledWithPaid,
      grossRevenue: round2(gross),
      refundHold: round2(refundHold),
      platformFeePercent,
      platformFee: round2(platformFee),
      eventNet: round2(eventNet),
      committed: round2(committed),
      available: round2(available),
      overdrawn: round2(Math.max(0, committed - eventNet)),
    };
  }

  /**
   * The event's money capability (its Curator) or the owning space's (a Space
   * Admin); platform admins pass via the IAM. Being the event's creator or
   * holding some space role is not enough.
   */
  private async assertEventMoney(userId: string, eventId: string, spaceId: string, what: string) {
    const user = { id: userId };
    const allowed =
      (await this.authz.can(user, Action.EVENT_MANAGE_MONEY, { eventId })) ||
      (await this.authz.can(user, Action.SPACE_MANAGE_MONEY, { spaceId }));
    if (!allowed) {
      throw new ForbiddenException(`You do not have permission to ${what}`);
    }
  }

  /**
   * A20: what the space's other events owe after refunds landed past their
   * payouts (`debt`), and how much of it this event must cover (`shortfall`):
   * the part their own unpaid balances can't. The space as a whole then never
   * pays out more than Space Financials says remains. Only an event with a
   * committed payout can be overdrawn, so the full scan runs only on a debt.
   */
  private async spaceShortfall(spaceId: string, exceptEventId: string, db: Db) {
    const balanceOf = (id: string) => this.computeBalance(id, db);
    const paidOut = await db.payout.findMany({
      where: { eventId: { not: exceptEventId }, event: { spaceId }, status: { in: this.COMMITTING_STATUSES } },
      select: { eventId: true },
      distinct: ['eventId'],
    });
    let debt = 0;
    for (const p of paidOut) debt += (await balanceOf(p.eventId)).overdrawn;
    if (debt <= 0) return { debt: 0, shortfall: 0 };
    // ponytail: one computeBalance per event in the space, only while a debt exists.
    const others = await db.event.findMany({ where: { spaceId, id: { not: exceptEventId } }, select: { id: true } });
    let cover = 0;
    for (const e of others) cover += (await balanceOf(e.id)).available;
    return { debt: round2(debt), shortfall: round2(Math.max(0, debt - cover)) };
  }

  /** How far an event's payouts already exceed what it earns (0 if they don't). */
  async eventOverdrawn(eventId: string): Promise<number> {
    return (await this.computeBalance(eventId)).overdrawn;
  }

  /**
   * `userId` set = operator request (must hold the event's money capability or
   * the owning space's); omitted = platform-admin route, already role-gated.
   * The old `createdBy` filter only zeroed gross revenue for outsiders while
   * still returning the balance + latest payout for any event id.
   */
  async getEventPayoutSummary(eventId: string, userId?: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { spaceId: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    if (userId) {
      await this.assertEventMoney(userId, eventId, event.spaceId, 'view this event’s payouts');
    }

    const registrations = await this.prisma.eventRegistration.findMany({
      where: { eventId, ...this.HELD },
      select: this.HELD_SELECT,
    });

    const balance = await this.computeBalance(eventId);

    const existingPayout = await this.prisma.payout.findFirst({
      where: { eventId, status: { not: PayoutStatus.CANCELLED } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      eventId,
      registrationCount: registrations.length,
      grossRevenue: balance.grossRevenue,
      defaultPlatformFeePercent: balance.platformFeePercent,
      estimatedPlatformFee: balance.platformFee,
      // The organiser's total net entitlement for the event…
      eventNet: balance.eventNet,
      // …how much is already held by pending/paid payouts…
      committed: balance.committed,
      // …and what a new payout can still draw (the custom-amount ceiling).
      available: balance.available,
      // Paid out beyond the entitlement (refunds after a payout): to recover.
      overdrawn: balance.overdrawn,
      existingPayout,
    };
  }

  /**
   * The Transactions page tiles (Space web + mobile) for an event's
   * registrations, optionally one ticket type: settle() on the server, so the
   * Net tile carries each sale's organiser fee like the payout figures do.
   * Same rows and access as the transactions list and export.
   */
  async getEventTransactions(userId: string, eventId: string, ticketTypeId?: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { space: { select: { subscription: true } } },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (!(await this.authz.can({ id: userId }, Action.EVENT_MANAGE_ATTENDEES, { eventId }))) {
      throw new ForbiddenException('You do not have permission to view this event’s transactions');
    }
    const rows = await this.prisma.eventRegistration.findMany({
      where: {
        eventId,
        ...(ticketTypeId ? { ticketTypeId } : {}),
        // A transaction moved money: free RSVPs are left out.
        OR: [{ totalAmount: { gt: 0 } }, { paymentId: { not: null } }, { orderId: { not: null } }],
      },
      select: { ...SETTLE_SELECT, refundDueAt: true },
    });
    return {
      ...settle(rows, this.resolvePlatformFeePercent(event.space?.subscription)),
      count: rows.length,
    };
  }

  // ─── Financials summary (space-scoped + platform-wide) ────────────────────
  // A cash-accurate roll-up used by the Financials pages. Cumulative figures
  // ("ever paid") survive refunds so nothing silently vanishes; the payout
  // figures reconcile as: netEntitlement = settled + pending + available.

  /** Registration statuses that ever represented real money in. */
  private readonly EVER_PAID: PaymentStatus[] = [
    PaymentStatus.PAID,
    PaymentStatus.PARTIALLY_REFUNDED,
    PaymentStatus.REFUNDED,
  ];

  /**
   * Sum registration money for a set of events. `eventIds === undefined` means
   * "every event" (platform-wide); an empty array short-circuits to zeros.
   *   - collectedOverall: gross ever paid (incl. the app processing fee)
   *   - processingFees:   the app fee the platform keeps
   *   - currentGross:     ticket revenue still held (PAID / PARTIALLY_REFUNDED, net of refunds)
   */
  private async aggregateRegistrations(eventIds?: string[]) {
    if (eventIds && eventIds.length === 0) {
      return { collectedOverall: 0, processingFees: 0, currentGross: 0 };
    }
    const eventFilter = eventIds ? { eventId: { in: eventIds } } : {};
    const online = { paymentMode: StayPaymentMode.ONLINE };
    const added = this.ADDON_ADDED;
    const [ever, current, stayEver, stayCurrent, addonEver, addonCurrent] = await Promise.all([
      this.prisma.eventRegistration.aggregate({
        where: { ...eventFilter, paymentStatus: { in: this.EVER_PAID } },
        _sum: { totalAmount: true, processingFee: true },
      }),
      this.prisma.eventRegistration.aggregate({
        where: { ...eventFilter, ...this.HELD },
        _sum: this.HELD_SUM,
      }),
      // Unifesto Stay money paid online counts alongside tickets.
      this.prisma.stayBooking.aggregate({
        where: { ...eventFilter, ...online, paymentStatus: { in: this.EVER_PAID } },
        _sum: { totalAmount: true, processingFee: true },
      }),
      this.prisma.stayBooking.aggregate({
        where: { ...eventFilter, ...online, ...this.HELD },
        _sum: this.HELD_SUM,
      }),
      // Extra group seats bought after booking count with the group's ticket.
      this.prisma.groupSeatPurchase.aggregate({
        where: { ...eventFilter, ...added, paymentStatus: { in: this.EVER_PAID } },
        _sum: { totalAmount: true, processingFee: true },
      }),
      this.prisma.groupSeatPurchase.aggregate({
        where: { ...eventFilter, ...added, ...this.HELD_ADDON },
        _sum: this.HELD_SUM,
      }),
    ]);
    const n = (d: Prisma.Decimal | null) => Number(d ?? 0);
    return {
      collectedOverall: n(ever._sum.totalAmount) + n(stayEver._sum.totalAmount) + n(addonEver._sum.totalAmount),
      processingFees: n(ever._sum.processingFee) + n(stayEver._sum.processingFee) + n(addonEver._sum.processingFee),
      currentGross: [current, stayCurrent, addonCurrent].reduce(
        (sum, c) => sum + n(c._sum.totalAmount) - n(c._sum.processingFee) - n(c._sum.refundedAmount),
        0,
      ),
    };
  }

  /**
   * `currentGross` of aggregateRegistrations, per event: money still held
   * (HELD rules) net of the app fee and refunds, across tickets, online stays
   * and add-on seats. Three groupBys for any number of events.
   */
  private async heldFeeByEvent(
    eventIds: string[] | undefined,
    fallbackPercent: (eventId: string) => number,
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (eventIds && eventIds.length === 0) return out;
    const eventId = eventIds ? { eventId: { in: eventIds } } : {};
    const sum = this.HELD_SUM;
    const by: ['eventId', 'platformFeePercent'] = ['eventId', 'platformFeePercent'];
    const [regs, stays, addons] = await Promise.all([
      this.prisma.eventRegistration.groupBy({ by, where: { ...eventId, ...this.HELD }, _sum: sum }),
      this.prisma.stayBooking.groupBy({
        by,
        where: { ...eventId, paymentMode: StayPaymentMode.ONLINE, ...this.HELD },
        _sum: sum,
      }),
      this.prisma.groupSeatPurchase.groupBy({
        by,
        where: { ...eventId, ...this.HELD_ADDON, ...this.ADDON_ADDED },
        _sum: sum,
      }),
    ]);
    const groups = new Map<string, { net: number; percent: Prisma.Decimal | null }[]>();
    for (const r of [...regs, ...stays, ...addons]) {
      const net =
        Number(r._sum.totalAmount ?? 0) -
        Number(r._sum.processingFee ?? 0) -
        Number(r._sum.refundedAmount ?? 0);
      const list = groups.get(r.eventId) ?? [];
      list.push({ net, percent: r.platformFeePercent });
      groups.set(r.eventId, list);
    }
    for (const [id, list] of groups) {
      out.set(id, feeAtFrozenRates(list, fallbackPercent(id)));
    }
    return out;
  }

  /** Sum payout money for a set of events (or all events when undefined). */
  private async aggregatePayouts(eventIds?: string[]) {
    if (eventIds && eventIds.length === 0) return { settled: 0, pending: 0 };
    const eventFilter = eventIds ? { eventId: { in: eventIds } } : {};
    const [completed, pending] = await Promise.all([
      this.prisma.payout.aggregate({
        where: { ...eventFilter, status: PayoutStatus.COMPLETED },
        _sum: { netAmount: true },
      }),
      this.prisma.payout.aggregate({
        where: {
          ...eventFilter,
          status: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] },
        },
        _sum: { netAmount: true },
      }),
    ]);
    return {
      settled: Number(completed._sum.netAmount ?? 0),
      pending: Number(pending._sum.netAmount ?? 0),
    };
  }

  /**
   * Registration money refunded without a refund request: the automatic full
   * refund of a ticket that sold out mid-payment, or a capture refunded in
   * Razorpay before reconcile. Collected still counts these, so refunded must too.
   */
  private readonly AUTO_REFUNDED = {
    refundedAmount: { gt: 0 },
    refundRequests: { none: { status: RefundStatus.APPROVED } },
  } satisfies Prisma.EventRegistrationWhereInput;

  /** Sum the cash returned by APPROVED refunds (and automatic ones) for a set of events. */
  private async aggregateRefunds(eventIds?: string[]) {
    if (eventIds && eventIds.length === 0) return 0;
    const eventFilter = eventIds ? { eventId: { in: eventIds } } : {};
    const [agg, stays, auto] = await Promise.all([
      this.prisma.refundRequest.aggregate({
        where: { ...eventFilter, status: RefundStatus.APPROVED },
        _sum: { cashRefunded: true },
      }),
      this.prisma.stayBooking.aggregate({
        where: { ...eventFilter, paymentMode: StayPaymentMode.ONLINE },
        _sum: { refundedAmount: true },
      }),
      this.prisma.eventRegistration.aggregate({
        where: { ...eventFilter, ...this.AUTO_REFUNDED },
        _sum: { refundedAmount: true },
      }),
    ]);
    return (
      Number(agg._sum.cashRefunded ?? 0) +
      Number(stays._sum.refundedAmount ?? 0) +
      Number(auto._sum.refundedAmount ?? 0)
    );
  }

  /** Assemble the summary from the three aggregates + a platform-fee figure. */
  private buildFinancials(
    reg: { collectedOverall: number; processingFees: number; currentGross: number },
    payouts: { settled: number; pending: number },
    refunded: number,
    platformFee: number,
  ) {
    const netEntitlement = reg.currentGross - platformFee;
    const remaining = netEntitlement - payouts.settled - payouts.pending;
    const available = Math.max(0, remaining);
    return {
      collectedOverall: round2(reg.collectedOverall),
      processingFees: round2(reg.processingFees),
      ticketRevenue: round2(reg.collectedOverall - reg.processingFees),
      refunded: round2(refunded),
      platformFee: round2(platformFee),
      netEntitlement: round2(netEntitlement),
      settled: round2(payouts.settled),
      pending: round2(payouts.pending),
      available: round2(available),
      // Payouts beyond the entitlement (refunds that landed after a payout).
      // Not part of the reconciliation: netEntitlement + overdrawn = settled + pending.
      overdrawn: round2(Math.max(0, -remaining)),
    };
  }

  /**
   * Throw unless `userId` holds a space-admin role in `spaceId`. Shared by the
   * space-scoped read endpoints (financials, payouts) so a curator/space admin
   * who did not personally create the events can still see the space's money.
   */
  private async assertSpaceAdmin(
    userId: string,
    spaceId: string,
    action = 'view this space’s data',
  ) {
    if (!(await this.authz.can({ id: userId }, Action.SPACE_MANAGE_MONEY, { spaceId }))) {
      throw new ForbiddenException(`Only a space admin can ${action}`);
    }
  }

  /**
   * Every payout for a space's events — not just the caller's own. Scoped to
   * the space (via `event.spaceId`) rather than `payout.userId` (which is the
   * event creator), so any of the space's admins see the full payout history.
   */
  async getSpacePayouts(userId: string, spaceId: string) {
    await this.assertSpaceAdmin(userId, spaceId, 'view this space’s payouts');
    const payouts = await this.prisma.payout.findMany({
      where: { event: { spaceId } },
      include: {
        event: { select: { id: true, title: true, slug: true, startDateTime: true } },
        bankAccount: {
          select: {
            methodType: true,
            bankName: true,
            accountNumber: true,
            upiId: true,
            accountHolderName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { payouts: payouts.map(maskPayoutAccount) };
  }

  /** Financials for one space. Viewable by the space's admins (or a platform admin). */
  async getSpaceFinancials(userId: string, spaceId: string, isPlatformAdmin = false) {
    if (!isPlatformAdmin) {
      await this.assertSpaceAdmin(userId, spaceId, 'view this space’s financials');
    }
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      select: { subscription: true },
    });
    if (!space) throw new NotFoundException('Space not found');

    const events = await this.prisma.event.findMany({
      where: { spaceId },
      select: { id: true },
    });
    const eventIds = events.map((e) => e.id);
    const feePercent = this.resolvePlatformFeePercent(space.subscription);

    const [reg, payouts, refunded] = await Promise.all([
      this.aggregateRegistrations(eventIds),
      this.aggregatePayouts(eventIds),
      this.aggregateRefunds(eventIds),
    ]);
    const feeByEvent = await this.heldFeeByEvent(eventIds, () => feePercent);
    const platformFee = round2([...feeByEvent.values()].reduce((a, b) => a + b, 0));
    return this.buildFinancials(reg, payouts, refunded, platformFee);
  }

  /**
   * Platform-wide financials (Apex). Money-in / refunds / payouts are global
   * single-query aggregates; the platform fee is summed per REVENUE_SHARE space
   * (only those carry a non-zero cut), so net entitlement stays accurate even
   * though the fee percent differs per space.
   */
  async getPlatformFinancials() {
    // The demo space's money is left out (P23): aggregate over every other event.
    const [spaces, events] = await Promise.all([
      this.prisma.space.findMany({ where: NOT_DEMO_SPACE, select: { id: true, subscription: true } }),
      this.prisma.event.findMany({ where: NOT_DEMO_EVENT, select: { id: true, spaceId: true } }),
    ]);
    const eventIds = events.map((e) => e.id);
    const [reg, payouts, refunded] = await Promise.all([
      this.aggregateRegistrations(eventIds),
      this.aggregatePayouts(eventIds),
      this.aggregateRefunds(eventIds),
    ]);

    // Each sale is charged at the rate frozen on it (A21); today's space rate
    // only for a sale without one. Fixed number of queries for any size.
    const pctBySpace = new Map(spaces.map((s) => [s.id, this.resolvePlatformFeePercent(s.subscription)]));
    const spaceOf = new Map(events.map((e) => [e.id, e.spaceId]));
    const feeByEvent = await this.heldFeeByEvent(eventIds, (id) => pctBySpace.get(spaceOf.get(id) ?? '') ?? 0);
    const platformFee = round2([...feeByEvent.values()].reduce((x, y) => x + y, 0));

    return {
      ...this.buildFinancials(reg, payouts, refunded, platformFee),
      // Platform take-home: the app fee it always keeps plus the revenue-share
      // cut. Surfaced only on the platform view, not the space view.
      platformEarnings: round2(reg.processingFees + platformFee),
    };
  }

  /**
   * Per-space + per-event breakdown behind the platform Financials page. Rather
   * than the fan-out `getPlatformFinancials` uses (a query set per space), this
   * runs ONE `groupBy` per money source keyed by `eventId`, then assembles and
   * rolls the rows up in memory — a fixed number of round-trips regardless of
   * how many spaces or events exist. Each level (event → space → platform) is
   * built from its own RAW aggregates so every row independently reconciles as
   * `netEntitlement = settled + pending + available`.
   */
  async getPlatformFinancialsBreakdown() {
    const stayOnline = { paymentMode: StayPaymentMode.ONLINE };
    const [
      spaces,
      events,
      everByEvent,
      currentByEvent,
      payoutByEvent,
      refundByEvent,
      stayEverByEvent,
      stayCurrentByEvent,
      stayRefundByEvent,
      addonEverByEvent,
      addonCurrentByEvent,
      autoRefundByEvent,
    ] = await Promise.all([
        // Every total is rolled up from this list, so leaving the demo space
        // out here keeps it out of the platform totals too (P23).
        this.prisma.space.findMany({
          where: NOT_DEMO_SPACE,
          select: { id: true, name: true, slug: true, subscription: true },
        }),
        this.prisma.event.findMany({
          select: {
            id: true,
            title: true,
            slug: true,
            spaceId: true,
            startDateTime: true,
          },
        }),
        this.prisma.eventRegistration.groupBy({
          by: ['eventId'],
          where: { paymentStatus: { in: this.EVER_PAID } },
          _sum: { totalAmount: true, processingFee: true },
        }),
        this.prisma.eventRegistration.groupBy({
          by: ['eventId'],
          where: this.HELD,
          _sum: this.HELD_SUM,
        }),
        this.prisma.payout.groupBy({
          by: ['eventId', 'status'],
          _sum: { netAmount: true },
        }),
        this.prisma.refundRequest.groupBy({
          by: ['eventId'],
          where: { status: RefundStatus.APPROVED },
          _sum: { cashRefunded: true },
        }),
        // Unifesto Stay money paid online, folded in with tickets below.
        this.prisma.stayBooking.groupBy({
          by: ['eventId'],
          where: { ...stayOnline, paymentStatus: { in: this.EVER_PAID } },
          _sum: { totalAmount: true, processingFee: true },
        }),
        this.prisma.stayBooking.groupBy({
          by: ['eventId'],
          where: { ...stayOnline, ...this.HELD },
          _sum: this.HELD_SUM,
        }),
        this.prisma.stayBooking.groupBy({
          by: ['eventId'],
          where: stayOnline,
          _sum: { refundedAmount: true },
        }),
        // Extra group seats bought after booking (refunds of these run through
        // refund requests, so they're already in refundByEvent).
        this.prisma.groupSeatPurchase.groupBy({
          by: ['eventId'],
          where: { ...this.ADDON_ADDED, paymentStatus: { in: this.EVER_PAID } },
          _sum: { totalAmount: true, processingFee: true },
        }),
        this.prisma.groupSeatPurchase.groupBy({
          by: ['eventId'],
          where: { ...this.ADDON_ADDED, ...this.HELD_ADDON },
          _sum: this.HELD_SUM,
        }),
        this.prisma.eventRegistration.groupBy({
          by: ['eventId'],
          where: this.AUTO_REFUNDED,
          _sum: { refundedAmount: true },
        }),
      ]);

    // The platform fee per event, each sale at its frozen rate (A21).
    const pctBySpace = new Map(spaces.map((s) => [s.id, this.resolvePlatformFeePercent(s.subscription)]));
    const spaceOf = new Map(events.map((e) => [e.id, e.spaceId]));
    const feeByEvent = await this.heldFeeByEvent(undefined, (id) => pctBySpace.get(spaceOf.get(id) ?? '') ?? 0);

    // Index every aggregate by eventId for O(1) lookup during assembly.
    const addTo = (
      map: Map<string, { total: number; fee: number }>,
      rows: {
        eventId: string;
        _sum: { totalAmount: Prisma.Decimal | null; processingFee: Prisma.Decimal | null; refundedAmount?: Prisma.Decimal | null };
      }[],
    ) => {
      for (const r of rows) {
        const prev = map.get(r.eventId) ?? { total: 0, fee: 0 };
        // Held money nets out what was refunded (only the current-* sums carry it).
        map.set(r.eventId, {
          total: prev.total + Number(r._sum.totalAmount ?? 0) - Number(r._sum.refundedAmount ?? 0),
          fee: prev.fee + Number(r._sum.processingFee ?? 0),
        });
      }
    };
    const ever = new Map<string, { total: number; fee: number }>();
    addTo(ever, everByEvent);
    addTo(ever, stayEverByEvent);
    addTo(ever, addonEverByEvent);
    const current = new Map<string, { total: number; fee: number }>();
    addTo(current, currentByEvent);
    addTo(current, stayCurrentByEvent);
    addTo(current, addonCurrentByEvent);
    const settledByEvent = new Map<string, number>();
    const pendingByEvent = new Map<string, number>();
    for (const r of payoutByEvent) {
      if (!r.eventId) continue;
      const amt = Number(r._sum.netAmount ?? 0);
      if (r.status === PayoutStatus.COMPLETED) {
        settledByEvent.set(r.eventId, (settledByEvent.get(r.eventId) ?? 0) + amt);
      } else if (
        r.status === PayoutStatus.PENDING ||
        r.status === PayoutStatus.PROCESSING
      ) {
        pendingByEvent.set(r.eventId, (pendingByEvent.get(r.eventId) ?? 0) + amt);
      }
    }
    const refundByEventMap = new Map<string, number>();
    for (const r of refundByEvent) {
      if (!r.eventId) continue;
      refundByEventMap.set(r.eventId, Number(r._sum.cashRefunded ?? 0));
    }
    for (const r of [...stayRefundByEvent, ...autoRefundByEvent]) {
      const amt = Number(r._sum.refundedAmount ?? 0);
      if (amt) refundByEventMap.set(r.eventId, (refundByEventMap.get(r.eventId) ?? 0) + amt);
    }

    // Bucket events under their space.
    const eventsBySpace = new Map<string, typeof events>();
    for (const e of events) {
      const list = eventsBySpace.get(e.spaceId);
      if (list) list.push(e);
      else eventsBySpace.set(e.spaceId, [e]);
    }

    // Platform-level raw accumulators (summed from every space).
    const platformAcc = { collectedOverall: 0, processingFees: 0, currentGross: 0 };
    let platformSettled = 0;
    let platformPending = 0;
    let platformRefunded = 0;
    let platformFeeTotal = 0;

    const spaceRows = spaces.map((space) => {
      const feePercent = this.resolvePlatformFeePercent(space.subscription);
      const billingModel = space.subscription?.billingModel ?? null;
      const spaceEvents = eventsBySpace.get(space.id) ?? [];

      // Space-level raw accumulators (summed from this space's events).
      const spaceAcc = { collectedOverall: 0, processingFees: 0, currentGross: 0 };
      let spaceSettled = 0;
      let spacePending = 0;
      let spaceRefunded = 0;
      let spaceFee = 0;

      const eventRows = spaceEvents.map((e) => {
        const ev = ever.get(e.id) ?? { total: 0, fee: 0 };
        const cur = current.get(e.id) ?? { total: 0, fee: 0 };
        const reg = {
          collectedOverall: ev.total,
          processingFees: ev.fee,
          currentGross: cur.total - cur.fee,
        };
        const payouts = {
          settled: settledByEvent.get(e.id) ?? 0,
          pending: pendingByEvent.get(e.id) ?? 0,
        };
        const refunded = refundByEventMap.get(e.id) ?? 0;
        const platformFee = feeByEvent.get(e.id) ?? 0;

        // Fold this event's raw figures into the space accumulator.
        spaceFee += platformFee;
        spaceAcc.collectedOverall += reg.collectedOverall;
        spaceAcc.processingFees += reg.processingFees;
        spaceAcc.currentGross += reg.currentGross;
        spaceSettled += payouts.settled;
        spacePending += payouts.pending;
        spaceRefunded += refunded;

        return {
          eventId: e.id,
          title: e.title,
          slug: e.slug,
          startDateTime: e.startDateTime,
          ...this.buildFinancials(reg, payouts, refunded, platformFee),
        };
      });

      spaceFee = round2(spaceFee);

      // Fold this space's raw figures into the platform accumulator.
      platformAcc.collectedOverall += spaceAcc.collectedOverall;
      platformAcc.processingFees += spaceAcc.processingFees;
      platformAcc.currentGross += spaceAcc.currentGross;
      platformSettled += spaceSettled;
      platformPending += spacePending;
      platformRefunded += spaceRefunded;
      platformFeeTotal += spaceFee;

      return {
        spaceId: space.id,
        name: space.name,
        slug: space.slug,
        feePercent,
        billingModel,
        eventCount: eventRows.length,
        ...this.buildFinancials(
          spaceAcc,
          { settled: spaceSettled, pending: spacePending },
          spaceRefunded,
          spaceFee,
        ),
        platformEarnings: round2(spaceAcc.processingFees + spaceFee),
        events: eventRows,
      };
    });

    const totals = {
      ...this.buildFinancials(
        platformAcc,
        { settled: platformSettled, pending: platformPending },
        platformRefunded,
        platformFeeTotal,
      ),
      platformEarnings: round2(platformAcc.processingFees + platformFeeTotal),
    };

    return { totals, spaces: spaceRows };
  }

  /**
   * Create a payout for an event as a withdrawal from its available balance.
   *
   * `netAmount` (optional) is the exact amount to transfer — the custom-amount
   * option. It is the FINAL net figure (the platform fee is already reflected
   * in `available`, so nothing further is deducted) and must not exceed what is
   * left. Omit it to pay out the whole remaining balance in one go. Multiple
   * payouts per event are allowed; the `available` ceiling is what stops an
   * event ever being over-paid.
   */
  async createPayout(
    dto:
      | CreatePayoutDto
      | { eventId: string; bankAccountId: string; netAmount?: number; notes?: string },
    adminId: string,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: dto.eventId },
      select: { id: true, createdBy: true, spaceId: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    // `!(x > 0)` also rejects NaN, which slips past `x <= 0` (S29).
    if (dto.netAmount != null && !(dto.netAmount > 0)) {
      throw new BadRequestException('Payout amount must be greater than zero');
    }
    // Only the creator's or a Space Admin's verified account, admin picks too (A20).
    await this.assertAccountEligibleForEvent(event, dto.bankAccountId);

    // Compute-then-insert must not interleave with another payout for the same
    // event, or both read the same `available` and the event is paid twice.
    // A per-event advisory lock (released at commit) serialises them, and a
    // per-space one stops two events of a space both paying out past what the
    // space nets to (A20). Always event, then space, so they can't deadlock.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'payout:' + dto.eventId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'payout-space:' + event.spaceId}))`;
      const balance = await this.computeBalance(dto.eventId, tx);
      if (balance.cancelledWithPaid) {
        throw new BadRequestException(
          'This event was cancelled: refund its paid attendees before any payout',
        );
      }
      if (balance.available <= 0) {
        throw new BadRequestException(
          'No balance available to pay out for this event',
        );
      }

      // Refunds after a payout can leave another event of the space overdrawn:
      // the space nets that debt, as Space Financials already does (A20).
      const { debt, shortfall } = await this.spaceShortfall(event.spaceId, dto.eventId, tx);
      const payable = round2(Math.max(0, balance.available - shortfall));
      const why = shortfall
        ? ` Other events in this space are overdrawn by ₹${debt.toFixed(2)} after refunds, ` +
          `so ₹${shortfall.toFixed(2)} of this event's ₹${balance.available.toFixed(2)} is held to cover it.`
        : '';
      if (payable <= 0) {
        throw new BadRequestException(`No balance available to pay out for this event.${why}`);
      }

      // Custom amount = exactly what to transfer; else the whole remaining balance.
      let netAmount: number;
      if (dto.netAmount != null) {
        if (round2(dto.netAmount) > payable) {
          throw new BadRequestException(
            `Amount exceeds the available balance of ₹${payable.toFixed(2)}.${why}`,
          );
        }
        netAmount = round2(dto.netAmount);
      } else {
        netAmount = payable;
      }

      // Settlement is manual, so a payout is queued for immediate admin action.
      const scheduledAt = new Date();

      // The record is a net withdrawal: the platform fee is accounted once at the
      // event level (inside `available`), so per-payout fee fields are zero and
      // gross == net. `platformFeePercent` is kept for reference only.
      return tx.payout.create({
        data: {
          eventId: dto.eventId,
          userId: event.createdBy,
          bankAccountId: dto.bankAccountId,
          grossRevenue: netAmount,
          platformFeePercent: balance.platformFeePercent,
          platformFee: 0,
          netAmount,
          scheduledAt,
          status: PayoutStatus.PENDING,
          createdBy: adminId,
          notes: dto.notes,
        },
        include: {
          event: { select: { title: true } },
          user: { select: { fullName: true, username: true } },
          bankAccount: true,
        },
      });
    });
  }

  /**
   * The set of users whose bank accounts an event may pay out to: the event
   * creator plus every Space Admin of the event's space. This is what lets an
   * organiser route an event's earnings to another admin's account. Space Admin
   * roles are space-scoped (eventId null), so a space grant covers every event (super or sub) under it.
   */
  private async getEligibleAccountUserIds(event: {
    createdBy: string;
    spaceId: string;
  }): Promise<Set<string>> {
    const roles = await this.prisma.userRole.findMany({
      where: {
        spaceId: event.spaceId,
        role: { code: { in: [...SPACE_ADMIN_ROLE_CODES] } },
      },
      select: { userId: true },
    });
    return new Set([event.createdBy, ...roles.map((r) => r.userId)]);
  }

  /**
   * Accounts an event's payout may be sent to — VERIFIED accounts owned by the
   * creator or a space co/organiser. Returned masked for a picker UI. Only the
   * event organiser (creator) may look these up.
   */
  async getEligibleAccountsForEvent(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { createdBy: true, spaceId: true, payoutBankAccountId: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    await this.assertEventMoney(userId, eventId, event.spaceId, 'view this event’s payout accounts');
    const eligibleUserIds = await this.getEligibleAccountUserIds(event);

    const userIds = [...eligibleUserIds];
    const accounts = await this.prisma.payoutBankAccount.findMany({
      where: { userId: { in: userIds }, status: BankAccountStatus.VERIFIED },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
      include: {
        user: { select: { id: true, fullName: true, username: true } },
      },
    });

    return {
      selectedBankAccountId: event.payoutBankAccountId,
      accounts: accounts.map((a) => ({
        id: a.id,
        methodType: a.methodType,
        accountHolderName: a.accountHolderName,
        bankName: a.bankName,
        // Masked — never expose the full account number to a routing picker.
        accountNumberLast4: a.accountNumber ? a.accountNumber.slice(-4) : null,
        upiId: maskUpiId(a.upiId),
        isPrimary: a.isPrimary,
        ownerId: a.userId,
        ownerName: a.user.fullName || a.user.username || 'Organiser',
        isOwn: a.userId === event.createdBy,
      })),
    };
  }

  /**
   * Persist (or clear) an event's default payout account. Passing null clears
   * the override, so payouts fall back to the creator's primary. A non-null id
   * must be a VERIFIED account owned by the creator or a space co/organiser.
   */
  async setEventPayoutAccount(
    userId: string,
    eventId: string,
    bankAccountId: string | null,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { createdBy: true, spaceId: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    await this.assertEventMoney(userId, eventId, event.spaceId, 'set this event’s payout account');

    if (bankAccountId) {
      await this.assertAccountEligibleForEvent(event, bankAccountId);
    }

    return this.prisma.event.update({
      where: { id: eventId },
      data: { payoutBankAccountId: bankAccountId },
      select: { id: true, payoutBankAccountId: true },
    });
  }

  /**
   * Validate that `bankAccountId` is a VERIFIED account owned by the event
   * creator or a space co/organiser. Throws otherwise. Returns the account.
   */
  private async assertAccountEligibleForEvent(
    event: { createdBy: string; spaceId: string },
    bankAccountId: string,
  ) {
    const account = await this.prisma.payoutBankAccount.findUnique({
      where: { id: bankAccountId },
    });
    if (!account || account.status !== BankAccountStatus.VERIFIED) {
      throw new BadRequestException('Bank account not found or not verified');
    }
    const eligible = await this.getEligibleAccountUserIds(event);
    if (!eligible.has(account.userId)) {
      throw new ForbiddenException(
        'That account belongs to someone who is not an organiser of this event',
      );
    }
    return account;
  }

  /**
   * Resolve which account an event's payout goes to, in priority order:
   *   1. an explicit `bankAccountId` passed for this payout (the request-time
   *      override), validated for eligibility;
   *   2. the event's persisted default (`payoutBankAccountId`), if still
   *      verified and eligible;
   *   3. the creator's VERIFIED primary account.
   */
  private async resolveEventPayoutAccount(
    event: { createdBy: string; spaceId: string; payoutBankAccountId: string | null },
    explicitBankAccountId?: string | null,
  ) {
    if (explicitBankAccountId) {
      return this.assertAccountEligibleForEvent(event, explicitBankAccountId);
    }

    if (event.payoutBankAccountId) {
      const preset = await this.prisma.payoutBankAccount.findFirst({
        where: {
          id: event.payoutBankAccountId,
          status: BankAccountStatus.VERIFIED,
        },
      });
      // A preset that is still valid + eligible wins; otherwise silently fall
      // through to the primary rather than blocking the payout.
      if (preset) {
        const eligible = await this.getEligibleAccountUserIds(event);
        if (eligible.has(preset.userId)) return preset;
      }
    }

    const primary = await this.prisma.payoutBankAccount.findFirst({
      where: {
        userId: event.createdBy,
        status: BankAccountStatus.VERIFIED,
        isPrimary: true,
      },
    });
    if (primary) return primary;

    // No method is flagged primary. Rather than blocking the payout, fall back
    // to one of the organiser's other verified methods (bank OR UPI) and
    // promote it to primary so future payouts resolve to the same account.
    const verified = await this.prisma.payoutBankAccount.findMany({
      where: {
        userId: event.createdBy,
        status: BankAccountStatus.VERIFIED,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (verified.length === 0) {
      throw new BadRequestException(
        'The organiser has no verified payout method (bank account or UPI). Ask them to add and verify one first.',
      );
    }

    const chosen = this.pickFallbackPayoutMethod(verified);
    // Auto-promote: clear any other primary flag, then flag the chosen one.
    await this.prisma.$transaction([
      this.prisma.payoutBankAccount.updateMany({
        where: { userId: event.createdBy, isPrimary: true },
        data: { isPrimary: false },
      }),
      this.prisma.payoutBankAccount.update({
        where: { id: chosen.id },
        data: { isPrimary: true },
      }),
    ]);
    return { ...chosen, isPrimary: true };
  }

  /**
   * Choose which verified method to use as the fallback payout destination when
   * the organiser has not flagged any method primary. `methods` is guaranteed
   * non-empty and ordered newest-first (by createdAt desc).
   */
  private pickFallbackPayoutMethod(
    methods: Prisma.PayoutBankAccountGetPayload<object>[],
  ): Prisma.PayoutBankAccountGetPayload<object> {
    // Money-safety bias: prefer a verified BANK account (cleaner UTRs, harder
    // to fat-finger than a UPI handle); otherwise use the most recent verified
    // method. `methods` is non-empty and ordered newest-first.
    return (
      methods.find((m) => m.methodType === PayoutMethodType.BANK) ?? methods[0]
    );
  }

  /**
   * Create a payout for an event, resolving the destination account (explicit
   * override → event default → creator's primary). Shared by the admin
   * on-demand create and the organiser payout request.
   */
  async createEventPayout(
    eventId: string,
    createdBy: string,
    netAmount?: number,
    bankAccountId?: string | null,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { createdBy: true, spaceId: true, payoutBankAccountId: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    const account = await this.resolveEventPayoutAccount(event, bankAccountId);
    return this.createPayout(
      { eventId, bankAccountId: account.id, netAmount },
      createdBy,
    );
  }

  /**
   * An organiser requests a payout for one of their space's events. Allowed as
   * soon as the event has earned revenue — it need not have ended, so a live
   * event with sales can be drawn down. (A zero-balance request is rejected
   * downstream by `createPayout`'s `available <= 0` guard.) Creates a PENDING
   * payout the admin then settles. `bankAccountId` (optional) routes it to a
   * specific eligible account; omit it for the event default or the primary.
   */
  async requestPayout(
    userId: string,
    eventId: string,
    netAmount?: number,
    bankAccountId?: string | null,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { title: true, spaceId: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    await this.assertEventMoney(userId, eventId, event.spaceId, 'request this event’s payout');
    await assertSpaceLive(this.prisma, { id: event.spaceId });
    const payout = await this.createEventPayout(eventId, userId, netAmount, bankAccountId);
    // D22: the request is a Platform case, which alerts platform admins.
    void this.notifyPayoutContacts(payout.id, 'requested');
    openSubjectCase(this.events, {
      subjectType: 'Payout',
      subjectId: payout.id,
      requesterId: userId,
      kind: SupportCaseKind.REQUEST,
      requestType: 'PAYOUT',
      desk: SupportDesk.PLATFORM,
      spaceId: event.spaceId,
      eventId,
      subject: `Payout for ${event.title}`,
      message: `Please pay out ₹${Number(payout.netAmount).toFixed(2)} for ${event.title}.`,
      notify: true,
    });
    return payout;
  }

  /**
   * Record a payout as settled. Transfers are made manually by an admin through
   * their own banking channel (NEFT/IMPS/UPI) — there is no automated gateway
   * transfer — so this marks the payout COMPLETED with the UTR the admin
   * entered (required, unique per payout) and who marked it, when (A32). The
   * change is conditional on PENDING (S12), so a double click can't mark twice.
   */
  async markPayoutPaid(payoutId: string, dto: MarkPayoutPaidDto, adminId: string) {
    const utr = dto?.utr?.trim() ?? '';
    if (utr.length < 6 || utr.length > 40) {
      throw new BadRequestException('Enter the UTR or bank reference (6 to 40 characters)');
    }
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== PayoutStatus.PENDING) {
      throw new ConflictException(`This payout is ${payout.status.toLowerCase()}, only a pending payout can be marked paid`);
    }
    const reused = await this.prisma.payout.findFirst({
      where: { id: { not: payoutId }, utr: { equals: utr, mode: 'insensitive' } },
      select: { id: true },
    });
    if (reused) throw new ConflictException('This UTR is already recorded on another payout');

    const now = new Date();
    const reference = dto?.reference?.trim();
    const notes = reference
      ? `${payout.notes ? `${payout.notes} · ` : ''}Paid manually (ref: ${reference})`
      : payout.notes;

    const updated = await this.pendingOnly(payoutId, {
      status: PayoutStatus.COMPLETED,
      processedAt: now,
      completedAt: now,
      paidAt: now,
      paidById: adminId,
      utr,
      notes,
    }).catch((err: unknown) => {
      // payouts_paid_utr_key: the same UTR saved on another payout at the same moment.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This UTR is already recorded on another payout');
      }
      throw err;
    });

    this.logger.log(`Payout ${payoutId} marked paid manually by ${adminId} (UTR ${utr})`);
    void this.notifyPayoutContacts(payoutId, 'paid');
    const ref = ` UTR ${updated.utr}.`;
    updateSubjectCase(this.events, {
      subjectType: 'Payout',
      subjectId: payoutId,
      actorId: adminId,
      text: `Unifesto paid ₹${Number(updated.netAmount).toFixed(2)}.${ref}`,
      status: SupportTicketStatus.RESOLVED,
      notify: true,
    });
    return updated;
  }

  async cancelPayout(payoutId: string, adminId: string) {
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== PayoutStatus.PENDING) throw new BadRequestException('Only PENDING payouts can be cancelled');
    const updated = await this.pendingOnly(payoutId, { status: PayoutStatus.CANCELLED, notes: `Cancelled by admin ${adminId}` });
    void this.notifyPayoutContacts(payoutId, 'cancelled');
    updateSubjectCase(this.events, {
      subjectType: 'Payout',
      subjectId: payoutId,
      actorId: adminId,
      text: 'Unifesto cancelled this payout. The amount is available to request again.',
      status: SupportTicketStatus.RESOLVED,
      notify: true,
    });
    return updated;
  }

  /**
   * Leave PENDING only if it is still PENDING. The status checks above read
   * first, so without this a payout marked paid and cancelled at the same time
   * could end CANCELLED and free money that already went out.
   */
  private async pendingOnly(payoutId: string, data: Prisma.PayoutUpdateInput) {
    try {
      return await this.prisma.payout.update({ where: { id: payoutId, status: PayoutStatus.PENDING }, data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new ConflictException('This payout was already settled or cancelled');
      }
      throw err;
    }
  }

  async getAllPayouts(page = 1, limit = 20, status?: string) {
    const where = status ? { status: status as PayoutStatus } : {};
    const [payouts, total] = await Promise.all([
      this.prisma.payout.findMany({
        where,
        include: {
          event: { select: { id: true, title: true, slug: true } },
          user: { select: { id: true, fullName: true, username: true } },
          // IFSC too: admins pay these by hand (manual bank transfer).
          bankAccount: { select: { methodType: true, bankName: true, accountNumber: true, ifscCode: true, upiId: true, accountHolderName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payout.count({ where }),
    ]);
    return { payouts, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getPayoutsForOrganiser(userId: string, page = 1, limit = 20) {
    const [payouts, total] = await Promise.all([
      this.prisma.payout.findMany({
        where: { userId },
        include: {
          event: { select: { id: true, title: true, slug: true, startDateTime: true } },
          bankAccount: { select: { methodType: true, bankName: true, accountNumber: true, upiId: true, accountHolderName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payout.count({ where: { userId } }),
    ]);
    return { payouts: payouts.map(maskPayoutAccount), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getAllBankAccounts(page = 1, limit = 20, status?: string) {
    const where = status ? { status: status as BankAccountStatus } : {};
    const [accounts, total] = await Promise.all([
      this.prisma.payoutBankAccount.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, username: true, mobileNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payoutBankAccount.count({ where }),
    ]);
    return { accounts, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
}
