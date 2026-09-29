import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentStatus, RegistrationStatus } from '@prisma/client';

/** Round a rupee figure to 2 dp. */
function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** A platform payment row, flattened across event + session registrations. */
interface PlatformPayment {
  source: 'EVENT' | 'SESSION' | 'STAY';
  registrationId: string;
  title: string;
  paymentStatus: PaymentStatus;
  razorpayAmount: number;
  processingFee: number;
  refundedAmount: number;
  paidAt: Date | null;
}

/**
 * Reconciliation reads: line the platform ledger up against Razorpay's own
 * record of payments, refunds, and settlements. Everything is fetched live
 * from Razorpay on demand (no cron, no local mirror). Amounts are returned in
 * rupees; Razorpay reports paise, so we divide by 100 at the boundary.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

  /**
   * Run a Razorpay list call, degrading to an empty result if it fails (e.g.
   * settlements not enabled on the account, a transient API error). A failing
   * source shouldn't 500 the whole dashboard — it just shows as empty.
   */
  private async safe<T>(label: string, fn: () => Promise<T[]>): Promise<T[]> {
    try {
      return await fn();
    } catch (err) {
      this.logger.warn(`Razorpay ${label} fetch failed: ${(err as Error)?.message ?? err}`);
      return [];
    }
  }

  /** Normalise a query window to UNIX seconds, defaulting to the last 30 days. */
  private resolveWindow(from?: string, to?: string): { fromSec: number; toSec: number } {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from
      ? new Date(from)
      : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    // Inclusive end-of-day for `to` when only a date was given.
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      toDate.setHours(23, 59, 59, 999);
    }
    return {
      fromSec: Math.floor(fromDate.getTime() / 1000),
      toSec: Math.floor(toDate.getTime() / 1000),
    };
  }

  /** Every platform payment (event + session + stay) captured via Razorpay in a window. */
  private async platformPayments(fromMs: number, toMs: number): Promise<PlatformPayment[]> {
    const window = { paidAt: { gte: new Date(fromMs), lte: new Date(toMs) } };

    const [events, sessions, stays] = await Promise.all([
      this.prisma.eventRegistration.findMany({
        where: { paymentId: { not: null }, ...window },
        select: {
          id: true,
          paymentId: true,
          paymentStatus: true,
          razorpayAmount: true,
          processingFee: true,
          refundedAmount: true,
          paidAt: true,
          event: { select: { title: true } },
        },
      }),
      this.prisma.sessionRegistration.findMany({
        where: { paymentId: { not: null }, ...window },
        select: {
          id: true,
          paymentId: true,
          paymentStatus: true,
          razorpayAmount: true,
          processingFee: true,
          refundedAmount: true,
          paidAt: true,
          session: { select: { title: true } },
        },
      }),
      // Unifesto Stay bookings paid online (pay-at-property has no paymentId).
      this.prisma.stayBooking.findMany({
        where: { paymentId: { not: null }, ...window },
        select: {
          id: true,
          paymentId: true,
          paymentStatus: true,
          totalAmount: true,
          processingFee: true,
          refundedAmount: true,
          paidAt: true,
          stay: { select: { name: true } },
          event: { select: { title: true } },
        },
      }),
    ]);

    const rows: (PlatformPayment & { paymentId: string })[] = [
      ...events.map((e) => ({
        source: 'EVENT' as const,
        registrationId: e.id,
        paymentId: e.paymentId as string,
        title: e.event?.title ?? 'Event',
        paymentStatus: e.paymentStatus,
        razorpayAmount: Number(e.razorpayAmount),
        processingFee: Number(e.processingFee),
        refundedAmount: Number(e.refundedAmount),
        paidAt: e.paidAt,
      })),
      ...sessions.map((s) => ({
        source: 'SESSION' as const,
        registrationId: s.id,
        paymentId: s.paymentId as string,
        title: s.session?.title ?? 'Session',
        paymentStatus: s.paymentStatus,
        razorpayAmount: Number(s.razorpayAmount),
        processingFee: Number(s.processingFee),
        refundedAmount: Number(s.refundedAmount),
        paidAt: s.paidAt,
      })),
      ...stays.map((s) => ({
        source: 'STAY' as const,
        registrationId: s.id,
        paymentId: s.paymentId as string,
        title: `Stay · ${s.stay?.name ?? 'Stay'} · ${s.event?.title ?? 'Event'}`,
        // A stay payment is always PAID/REFUNDED once it has a paymentId.
        paymentStatus: s.paymentStatus ?? PaymentStatus.PAID,
        razorpayAmount: Number(s.totalAmount),
        processingFee: Number(s.processingFee),
        refundedAmount: Number(s.refundedAmount),
        paidAt: s.paidAt,
      })),
    ];
    return rows as PlatformPayment[];
  }

  /** Index platform payments by their Razorpay payment id for O(1) matching. */
  private async platformByPaymentId(
    fromMs: number,
    toMs: number,
  ): Promise<Map<string, PlatformPayment & { paymentId: string }>> {
    const rows = (await this.platformPayments(fromMs, toMs)) as (PlatformPayment & {
      paymentId: string;
    })[];
    const map = new Map<string, PlatformPayment & { paymentId: string }>();
    for (const row of rows) map.set(row.paymentId, row);
    return map;
  }

  /**
   * Headline totals for a window: platform ledger vs Razorpay, plus the amount
   * Razorpay actually settled to the bank. Differences flag where the two sides
   * disagree.
   */
  async getSummary(from?: string, to?: string) {
    const { fromSec, toSec } = this.resolveWindow(from, to);
    const fromMs = fromSec * 1000;
    const toMs = toSec * 1000;

    const [rzpPayments, rzpRefunds, rzpSettlements, platform] = await Promise.all([
      this.safe('payments', () => this.payments.listPayments(fromSec, toSec)),
      this.safe('refunds', () => this.payments.listRefunds(fromSec, toSec)),
      this.safe('settlements', () => this.payments.listSettlements(fromSec, toSec)),
      this.platformPayments(fromMs, toMs),
    ]);

    // Razorpay side (paise → rupees). "captured" and "refunded" statuses both
    // mean the money was captured; failed/created never took money.
    const captured = rzpPayments.filter(
      (p) => p.status === 'captured' || p.status === 'refunded',
    );
    const rzpCaptured = captured.reduce((s, p) => s + p.amount, 0) / 100;
    const rzpFees = captured.reduce((s, p) => s + p.fee + p.tax, 0) / 100;
    const rzpRefunded =
      rzpRefunds
        .filter((r) => r.status !== 'failed')
        .reduce((s, r) => s + r.amount, 0) / 100;
    const rzpSettled =
      rzpSettlements.reduce((s, x) => s + x.amount, 0) / 100;

    // Platform side. Captured is compared on the payment date (platform `paidAt`
    // ≈ Razorpay capture time), so this is a fair comparison.
    const paid = platform.filter((p) => p.paymentStatus !== PaymentStatus.FAILED);
    const platformCaptured = paid.reduce((s, p) => s + p.razorpayAmount, 0);
    const platformFees = paid.reduce((s, p) => s + p.processingFee, 0);

    // Refunds must be compared on the REFUND date, not the payment date — a
    // June payment refunded in July belongs to July's Razorpay refunds but its
    // registration's `paidAt` is June, so summing registration.refundedAmount by
    // paidAt produced a false mismatch. Instead, match this window's Razorpay
    // refunds to the platform's refund requests by `razorpayRefundId`: the
    // "platform refunded" figure is the portion Razorpay refunds that the
    // platform actually recorded, so the difference is genuinely unrecorded.
    const refundIds = rzpRefunds.filter((r) => r.status !== 'failed').map((r) => r.id);
    const matchedRefunds = refundIds.length
      ? await this.prisma.refundRequest.findMany({
          where: { razorpayRefundId: { in: refundIds } },
          select: { razorpayRefundId: true, approvedAmount: true },
        })
      : [];
    const matchedById = new Map(
      matchedRefunds.map((m) => [m.razorpayRefundId as string, m]),
    );
    const platformRefunded = rzpRefunds
      .filter((r) => r.status !== 'failed' && matchedById.has(r.id))
      .reduce((s, r) => {
        const m = matchedById.get(r.id);
        // Prefer the platform's own approved amount; fall back to Razorpay's.
        return s + (m?.approvedAmount != null ? Number(m.approvedAmount) : r.amount / 100);
      }, 0);

    return {
      window: { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() },
      razorpay: {
        capturedCount: captured.length,
        captured: r2(rzpCaptured),
        refunded: r2(rzpRefunded),
        fees: r2(rzpFees),
        // What should hit the bank ≈ captured − refunded − Razorpay fees.
        net: r2(rzpCaptured - rzpRefunded - rzpFees),
        settledToBank: r2(rzpSettled),
        settlementCount: rzpSettlements.length,
      },
      platform: {
        paidCount: paid.length,
        captured: r2(platformCaptured),
        refunded: r2(platformRefunded),
        processingFees: r2(platformFees),
      },
      // Positive → Razorpay shows more than the platform ledger (money received
      // the platform hasn't recorded — the classic missed-webhook case).
      diff: {
        captured: r2(rzpCaptured - platformCaptured),
        refunded: r2(rzpRefunded - platformRefunded),
      },
    };
  }

  // A Razorpay account's balance is inherently all-time — money captured but not
  // yet settled sits from whenever it was captured. Razorpay has no balance API
  // for standard accounts, so we derive it from a full-history sweep. This early
  // epoch (2020-01-01) predates the platform, so it captures the whole account.
  private readonly ACCOUNT_EPOCH_SEC = 1577836800;

  /**
   * The money still held at Razorpay — captured, minus fees and refunds, minus
   * everything already settled to the bank. This is an ALL-TIME figure (a
   * window can't answer "what's my balance now?"), derived from a full-history
   * sweep since Razorpay exposes no balance endpoint for standard accounts.
   * `approximate` is true if the history exceeded the page cap.
   */
  async getBalance() {
    const from = this.ACCOUNT_EPOCH_SEC;
    const to = Math.floor(Date.now() / 1000);
    const cap = this.payments.RECON_BALANCE_MAX_PAGES;

    const [rzpPayments, rzpRefunds, rzpSettlements] = await Promise.all([
      this.safe('balance-payments', () => this.payments.listPayments(from, to, cap)),
      this.safe('balance-refunds', () => this.payments.listRefunds(from, to, cap)),
      this.safe('balance-settlements', () => this.payments.listSettlements(from, to, cap)),
    ]);

    const captured = rzpPayments.filter(
      (p) => p.status === 'captured' || p.status === 'refunded',
    );
    const capturedTotal = captured.reduce((s, p) => s + p.amount, 0) / 100;
    const fees = captured.reduce((s, p) => s + p.fee + p.tax, 0) / 100;
    const refunded =
      rzpRefunds.filter((r) => r.status !== 'failed').reduce((s, r) => s + r.amount, 0) / 100;
    const settled = rzpSettlements.reduce((s, x) => s + x.amount, 0) / 100;

    // Held ≈ captured − fees − refunds − settled (what Razorpay still owes the
    // bank). Never report a negative float from rounding/boundary noise.
    const balance = Math.max(0, capturedTotal - fees - refunded - settled);

    return {
      asOf: new Date().toISOString(),
      balance: r2(balance),
      captured: r2(capturedTotal),
      fees: r2(fees),
      refunded: r2(refunded),
      settled: r2(settled),
      // If any sweep hit the page cap, the balance is a lower-bound estimate.
      approximate: Boolean(
        (rzpPayments as { truncated?: boolean }).truncated ||
          (rzpSettlements as { truncated?: boolean }).truncated,
      ),
    };
  }

  /**
   * Line-by-line payment reconciliation. Starts from every Razorpay payment in
   * the window, matches it to a platform registration by payment id, and flags
   * the gaps in both directions:
   *   - MATCHED: present on both sides (with an amount-mismatch sub-flag).
   *   - MISSING_IN_PLATFORM: Razorpay captured it but no platform row → money
   *     received the platform never recorded.
   *   - MISSING_IN_RAZORPAY: platform marked PAID but no Razorpay payment in the
   *     window (often a date-boundary artefact; still worth surfacing).
   */
  async getPayments(from?: string, to?: string) {
    const { fromSec, toSec } = this.resolveWindow(from, to);
    const fromMs = fromSec * 1000;
    const toMs = toSec * 1000;

    const [rzpPayments, platformMap] = await Promise.all([
      this.safe('payments', () => this.payments.listPayments(fromSec, toSec)),
      this.platformByPaymentId(fromMs, toMs),
    ]);

    const seen = new Set<string>();
    const rows = rzpPayments.map((p) => {
      const match = platformMap.get(p.id);
      if (match) seen.add(p.id);
      const rzpAmount = p.amount / 100;
      const captured = p.status === 'captured' || p.status === 'refunded';

      let status: 'MATCHED' | 'MISSING_IN_PLATFORM' | 'RAZORPAY_UNCAPTURED';
      if (match) status = 'MATCHED';
      else if (captured) status = 'MISSING_IN_PLATFORM';
      else status = 'RAZORPAY_UNCAPTURED'; // failed/created — never took money

      const amountMismatch = match
        ? Math.abs(rzpAmount - match.razorpayAmount) > 1
        : false;

      return {
        paymentId: p.id,
        orderId: p.orderId,
        razorpayStatus: p.status,
        razorpayAmount: r2(rzpAmount),
        razorpayRefunded: r2(p.amountRefunded / 100),
        method: p.method,
        contact: p.contact ?? p.email,
        createdAt: new Date(p.createdAt).toISOString(),
        platform: match
          ? {
              source: match.source,
              registrationId: match.registrationId,
              title: match.title,
              paymentStatus: match.paymentStatus,
              amount: r2(match.razorpayAmount),
            }
          : null,
        status,
        amountMismatch,
        // Registration to deep-link the admin straight to the reconcile action.
        // For a captured payment with no platform row, the order's `notes`
        // carry the registrationId (order notes are resolved below when the
        // payment itself doesn't carry them).
        reconcileRegistrationId: match
          ? match.source === 'EVENT'
            ? match.registrationId
            : null
          : (p.notes?.registrationId ?? null),
      };
    });

    // Resolve the reconcile target for captured-but-unrecorded payments whose
    // payment notes lacked a registrationId, by reading the order's notes.
    // Bounded to the number of such rows (mismatches are few), and safe: a
    // failed lookup just leaves the row without a deep link.
    const needsOrderNotes = rows.filter(
      (r) => r.status === 'MISSING_IN_PLATFORM' && !r.reconcileRegistrationId && r.orderId,
    );
    await Promise.all(
      needsOrderNotes.map(async (r) => {
        try {
          const notes = await this.payments.fetchOrderNotes(r.orderId as string);
          if (notes?.registrationId) r.reconcileRegistrationId = notes.registrationId;
        } catch {
          /* leave without a deep link */
        }
      }),
    );

    // Platform PAID rows in the window that no Razorpay payment matched.
    const missingInRazorpay = [...platformMap.values()]
      .filter(
        (p) => p.paymentStatus === PaymentStatus.PAID && !seen.has(p.paymentId),
      )
      .map((p) => ({
        paymentId: p.paymentId,
        orderId: null,
        razorpayStatus: null,
        razorpayAmount: null,
        razorpayRefunded: null,
        method: null,
        contact: null,
        createdAt: p.paidAt?.toISOString() ?? null,
        platform: {
          source: p.source,
          registrationId: p.registrationId,
          title: p.title,
          paymentStatus: p.paymentStatus,
          amount: r2(p.razorpayAmount),
        },
        status: 'MISSING_IN_RAZORPAY' as const,
        amountMismatch: false,
        // Already a platform EVENT row → link to view it; sessions aren't
        // handled by the transactions detail page.
        reconcileRegistrationId: p.source === 'EVENT' ? p.registrationId : null,
      }));

    const all = [...rows, ...missingInRazorpay];
    const counts = {
      total: all.length,
      matched: all.filter((r) => r.status === 'MATCHED').length,
      missingInPlatform: all.filter((r) => r.status === 'MISSING_IN_PLATFORM').length,
      missingInRazorpay: missingInRazorpay.length,
      amountMismatch: all.filter((r) => r.amountMismatch).length,
    };

    return { window: { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() }, counts, rows: all };
  }

  /**
   * Captured Razorpay payments whose money is NOT reflected as a PAID platform
   * row — the actionable subset of `getPayments`, purpose-built for the
   * Orphaned Payments admin view. Each row is classified and given a one-click
   * target so the admin never has to hand-copy a payment id:
   *   - ORPHANED  — the payment's `notes.registrationId` no longer exists (the
   *     "reuse pending" cleanup deleted/cancelled it, or a retry replaced it).
   *     The money has no live registration. We suggest a same-attendee,
   *     same-event, same-amount PENDING registration to re-home it onto, and the
   *     attach call must pass `reassignOrphan`.
   *   - UNSETTLED — the notes registration still exists but is PENDING (a missed
   *     webhook). A plain reconcile with the payment id settles it in place.
   * Only fully-captured, non-refunded payments are listed (a refunded payment is
   * not money we should be attaching to a ticket). Session payments are excluded
   * — this view covers event registrations only.
   */
  async getOrphanedPayments(from?: string, to?: string) {
    const { fromSec, toSec } = this.resolveWindow(from, to);

    const rzpPayments = await this.safe('payments', () =>
      this.payments.listPayments(fromSec, toSec),
    );
    const captured = rzpPayments.filter(
      (p) => p.status === 'captured' && p.amountRefunded === 0,
    );
    const capturedIds = captured.map((p) => p.id);

    // Payments already attributed to a registration (event, session or stay)
    // are, by definition, not orphaned — skip them regardless of the notes.
    const [attachedEvents, attachedSessions, attachedStays] = await Promise.all([
      capturedIds.length
        ? this.prisma.eventRegistration.findMany({
            where: { paymentId: { in: capturedIds } },
            select: { paymentId: true },
          })
        : Promise.resolve([]),
      capturedIds.length
        ? this.prisma.sessionRegistration.findMany({
            where: { paymentId: { in: capturedIds } },
            select: { paymentId: true },
          })
        : Promise.resolve([]),
      capturedIds.length
        ? this.prisma.stayBooking.findMany({
            where: { paymentId: { in: capturedIds } },
            select: { paymentId: true },
          })
        : Promise.resolve([]),
    ]);
    const attributed = new Set<string>([
      ...attachedEvents.map((r) => r.paymentId as string),
      ...attachedSessions.map((r) => r.paymentId as string),
      ...attachedStays.map((r) => r.paymentId as string),
    ]);

    // Resolve the registration each unattributed payment was created for.
    // Prefer the payment notes; fall back to the order notes for the few that
    // lack them (an extra call only for those, and only for unattributed rows).
    const unattributed = captured.filter((p) => !attributed.has(p.id));
    const resolved = await Promise.all(
      unattributed.map(async (p) => {
        let regId = p.notes?.registrationId ?? null;
        let eventId = p.notes?.eventId ?? null;
        let userId = p.notes?.userId ?? null;
        if ((!regId || !eventId || !userId) && p.orderId) {
          try {
            const n = await this.payments.fetchOrderNotes(p.orderId);
            regId = regId ?? n.registrationId ?? null;
            eventId = eventId ?? n.eventId ?? null;
            userId = userId ?? n.userId ?? null;
          } catch {
            /* leave what we have */
          }
        }
        return { p, regId, eventId, userId };
      }),
    );

    // Which notes-registrations still exist (→ UNSETTLED, reconcile in place)
    // versus are gone (→ ORPHANED, needs re-homing).
    const regIds = [
      ...new Set(resolved.map((r) => r.regId).filter(Boolean) as string[]),
    ];
    const existing = regIds.length
      ? await this.prisma.eventRegistration.findMany({
          where: { id: { in: regIds } },
          select: { id: true },
        })
      : [];
    const existingIds = new Set(existing.map((r) => r.id));

    // Pool of live PENDING registrations to suggest as re-home targets for the
    // orphans, keyed by the attendees who own an orphaned payment.
    const orphanUserIds = [
      ...new Set(
        resolved
          .filter((r) => r.userId && !(r.regId && existingIds.has(r.regId)))
          .map((r) => r.userId as string),
      ),
    ];
    const suggestPool = orphanUserIds.length
      ? await this.prisma.eventRegistration.findMany({
          where: {
            userId: { in: orphanUserIds },
            paymentStatus: PaymentStatus.PENDING,
            status: { not: RegistrationStatus.CANCELLED },
          },
          select: {
            id: true,
            userId: true,
            eventId: true,
            razorpayAmount: true,
            event: { select: { title: true } },
            user: { select: { fullName: true, username: true } },
          },
        })
      : [];

    const rows = resolved.map((r) => {
      const notesRegExists = !!(r.regId && existingIds.has(r.regId));
      const orphaned = !notesRegExists;
      const amountPaise = r.p.amount;

      let suggestion:
        | { registrationId: string; eventTitle: string; attendee: string }
        | null = null;
      if (orphaned && r.userId) {
        const match = suggestPool.find(
          (c) =>
            c.userId === r.userId &&
            (!r.eventId || c.eventId === r.eventId) &&
            Math.round(Number(c.razorpayAmount) * 100) === amountPaise,
        );
        if (match) {
          suggestion = {
            registrationId: match.id,
            eventTitle: match.event?.title ?? 'Event',
            attendee: match.user?.fullName ?? match.user?.username ?? '—',
          };
        }
      }

      return {
        paymentId: r.p.id,
        orderId: r.p.orderId,
        amount: r2(amountPaise / 100),
        status: r.p.status,
        method: r.p.method,
        email: r.p.email,
        contact: r.p.contact,
        createdAt: new Date(r.p.createdAt).toISOString(),
        notesRegistrationId: r.regId,
        eventId: r.eventId,
        userId: r.userId,
        classification: (orphaned ? 'ORPHANED' : 'UNSETTLED') as
          | 'ORPHANED'
          | 'UNSETTLED',
        // The registration the attach button acts on: the (existing) notes reg
        // for UNSETTLED, the suggested live pending reg for ORPHANED. Null when
        // an orphan has no obvious target — the admin resolves it by hand.
        targetRegistrationId: orphaned
          ? suggestion?.registrationId ?? null
          : r.regId,
        reassignOrphan: orphaned,
        suggestion,
      };
    });

    // Orphans first (they need the special flow and human judgement), then the
    // straightforward missed-webhook rows.
    rows.sort((a, b) =>
      a.classification === b.classification
        ? 0
        : a.classification === 'ORPHANED'
          ? -1
          : 1,
    );

    return {
      window: {
        from: new Date(fromSec * 1000).toISOString(),
        to: new Date(toSec * 1000).toISOString(),
      },
      counts: {
        total: rows.length,
        orphaned: rows.filter((r) => r.classification === 'ORPHANED').length,
        unsettled: rows.filter((r) => r.classification === 'UNSETTLED').length,
        unresolved: rows.filter((r) => !r.targetRegistrationId).length,
      },
      rows,
    };
  }

  /**
   * Refund reconciliation: Razorpay refunds in the window matched to the
   * platform refund request that carries the same `razorpayRefundId`.
   */
  async getRefunds(from?: string, to?: string) {
    const { fromSec, toSec } = this.resolveWindow(from, to);
    const fromMs = fromSec * 1000;
    const toMs = toSec * 1000;

    const rzpRefunds = await this.safe('refunds', () =>
      this.payments.listRefunds(fromSec, toSec),
    );
    const ids = rzpRefunds.map((r) => r.id);

    const platformRefunds = ids.length
      ? await this.prisma.refundRequest.findMany({
          where: { razorpayRefundId: { in: ids } },
          select: {
            id: true,
            razorpayRefundId: true,
            approvedAmount: true,
            status: true,
            registration: { select: { event: { select: { title: true } } } },
          },
        })
      : [];
    const platformByRefundId = new Map(
      platformRefunds.map((p) => [p.razorpayRefundId as string, p]),
    );

    const rows = rzpRefunds.map((r) => {
      const match = platformByRefundId.get(r.id);
      return {
        refundId: r.id,
        paymentId: r.paymentId,
        razorpayAmount: r2(r.amount / 100),
        razorpayStatus: r.status,
        createdAt: new Date(r.createdAt).toISOString(),
        platform: match
          ? {
              refundRequestId: match.id,
              approvedAmount: match.approvedAmount ? Number(match.approvedAmount) : null,
              status: match.status,
              title: match.registration?.event?.title ?? 'Event',
            }
          : null,
        status: match ? 'MATCHED' : ('MISSING_IN_PLATFORM' as const),
      };
    });

    const counts = {
      total: rows.length,
      matched: rows.filter((r) => r.status === 'MATCHED').length,
      missingInPlatform: rows.filter((r) => r.status === 'MISSING_IN_PLATFORM').length,
    };
    return { window: { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() }, counts, rows };
  }

  /**
   * Razorpay settlements deposited to the platform bank in the window — the
   * "money that actually reached my account" view. Pure Razorpay data; the
   * platform has no equivalent record, so it stands alone.
   */
  async getSettlements(from?: string, to?: string) {
    const { fromSec, toSec } = this.resolveWindow(from, to);
    const settlements = await this.safe('settlements', () =>
      this.payments.listSettlements(fromSec, toSec),
    );
    const rows = settlements.map((s) => ({
      id: s.id,
      status: s.status,
      amount: r2(s.amount / 100),
      fees: r2(s.fees / 100),
      tax: r2(s.tax / 100),
      utr: s.utr,
      settledAt: new Date(s.createdAt).toISOString(),
    }));
    const totalSettled = rows.reduce((sum, s) => sum + s.amount, 0);
    return {
      window: {
        from: new Date(fromSec * 1000).toISOString(),
        to: new Date(toSec * 1000).toISOString(),
      },
      totalSettled: r2(totalSettled),
      count: rows.length,
      rows,
    };
  }
}
