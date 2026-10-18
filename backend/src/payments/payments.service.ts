import { Injectable, Logger } from '@nestjs/common';
import { PlatformConfigService } from '../subscription/platform-config.service';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';

/**
 * A refund under this key already went out, for a different amount. Money has
 * moved: the caller must not release its claim or retry with the new amount.
 */
export class RefundAlreadyIssuedError extends Error {
  constructor(
    readonly refundId: string,
    readonly amountRupees: number,
  ) {
    super(`A refund of ₹${amountRupees} (${refundId}) already went out for this request`);
  }
}

/** Razorpay definitely refused the call (4xx). Anything else may have gone through. */
export function isRazorpayRejection(err: any): boolean {
  const code = Number(err?.statusCode);
  return code >= 400 && code < 500;
}

/**
 * Refund at most once per `key` (A14). The key rides in the refund's notes, so
 * a retry after a timeout, crash or lost response finds the refund that already
 * went out instead of sending a second one. A refund Razorpay marked `failed`
 * doesn't count, so a failed one can be retried under the same key. Throws only
 * when Razorpay holds no live refund for the key. Returns the refund id.
 */
export async function refundOnce(
  razorpay: Razorpay,
  paymentId: string,
  amountRupees: number,
  key: string,
  notes: Record<string, string> = {},
): Promise<string> {
  const paise = Math.round(amountRupees * 100);
  const find = async (): Promise<string | null> => {
    // ponytail: first 100 refunds of a payment; no payment gets near that.
    const list: any = await razorpay.payments.fetchMultipleRefund(paymentId, { count: 100 });
    const hit = (list?.items ?? []).find(
      (r: any) => r.notes?.refundKey === key && r.status !== 'failed',
    );
    if (hit && Number(hit.amount) !== paise) {
      throw new RefundAlreadyIssuedError(String(hit.id), Number(hit.amount) / 100);
    }
    return hit ? String(hit.id) : null;
  };
  const existing = await find();
  if (existing) return existing;
  try {
    const r: any = await razorpay.payments.refund(paymentId, {
      amount: paise,
      notes: { ...notes, refundKey: key },
    } as any);
    return String(r.id);
  } catch (err) {
    // A timeout or 5xx may still have refunded: look again before failing.
    const after = await find().catch(() => null);
    if (after) return after;
    throw err;
  }
}

/**
 * True when a captured Razorpay payment is exactly `expectedRupees` in INR.
 * Webhooks must check this before settling: the row a payment resolves to is
 * only trusted when the money matches what that row charges.
 */
export function capturedAmountMatches(
  payment: { amount?: unknown; currency?: unknown },
  expectedRupees: unknown,
): boolean {
  return (
    payment.currency === 'INR' &&
    Number(payment.amount) === Math.round(Number(expectedRupees) * 100)
  );
}

/**
 * Options for opening a Razorpay order. `amount` is in rupees (the service
 * converts to paise); `notes` is attached to the order for later reconciliation
 * (webhooks, dashboards) and should carry whatever identifiers the caller needs
 * to tie the payment back to its domain record.
 */
export interface CreateOrderOptions {
  amount: number;
  receipt: string;
  notes?: Record<string, string>;
  currency?: string;
}

export interface RazorpayOrderResult {
  orderId: string;
  amount: number;
  currency: string;
}

/**
 * Options for a Razorpay Payment Link — a hosted checkout page Razorpay emails
 * and/or texts to the customer. Used when an organiser adds an attendee and
 * wants Razorpay to collect the ticket amount directly, rather than the attendee
 * going through the in-app checkout. `amount` is in rupees; `notes` rides along
 * to the resulting order so the existing `payment.captured` webhook can tie the
 * payment back to its registration (via `notes.registrationId`).
 */
export interface CreatePaymentLinkOptions {
  amount: number;
  description: string;
  customer: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  /** Unique reference echoed back on webhooks; we pass the registration id. */
  referenceId?: string;
  currency?: string;
}

export interface PaymentLinkResult {
  id: string;
  shortUrl: string;
}

/**
 * The single boundary between Unifesto and Razorpay. Any feature that takes
 * money (event registrations, sessions, …) goes through this service so that
 * order creation, signature verification, and the app-wide processing fee live
 * in exactly one place. Domain-specific consequences of a payment (issuing
 * tickets, incrementing seat counts) belong to the calling
 * feature, not here.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly razorpay: Razorpay;

  constructor(private readonly platformConfig: PlatformConfigService) {
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }

  /**
   * The app-wide processing fee (admin-set percent) for a given base price.
   * Applied to every paid transaction regardless of the organiser's plan, so
   * both events and sessions charge it identically.
   */
  computeProcessingFee(basePrice: number): number {
    const percent = this.platformConfig.getProcessingFeePercent();
    // Rounded to the paise: an unrounded fee (₹12.345) drifts from what
    // Razorpay charges (createOrder rounds to paise) and trips reconcile.
    return Math.round(basePrice * percent + 1e-9) / 100;
  }

  /**
   * Open a Razorpay order. Amount is given in rupees and converted to paise
   * here so callers never juggle the ×100 themselves.
   */
  async createOrder(options: CreateOrderOptions): Promise<RazorpayOrderResult> {
    const currency = options.currency ?? 'INR';
    // Razorpay rejects receipts longer than 40 chars (a UUID alone is 36). Guard
    // here so no caller can 500 the whole checkout over a slightly-too-long
    // prefix; receipts aren't required to be unique, so truncation is safe.
    let receipt = options.receipt;
    if (receipt.length > 40) {
      this.logger.warn(
        `Razorpay receipt "${receipt}" exceeds 40 chars — truncating`,
      );
      receipt = receipt.slice(0, 40);
    }
    const order = await this.razorpay.orders.create({
      amount: Math.round(options.amount * 100),
      currency,
      receipt,
      notes: options.notes,
    });

    this.logger.log(
      `Created Razorpay order ${order.id} (receipt ${options.receipt})`,
    );

    return {
      orderId: order.id,
      amount: options.amount,
      currency,
    };
  }

  /**
   * Create a Razorpay Payment Link and (optionally) have Razorpay notify the
   * customer by email/SMS. Amount is given in rupees and converted to paise here.
   * The link's `notes` propagate to the order Razorpay opens when the customer
   * pays, so `payment.captured` resolves the registration through the same
   * `resolveRegistrationIdForOrder` notes fallback the in-app flow uses — no new
   * webhook branch required.
   */
  async createPaymentLink(
    options: CreatePaymentLinkOptions,
  ): Promise<PaymentLinkResult> {
    const link = await (this.razorpay as any).paymentLink.create({
      amount: Math.round(options.amount * 100),
      currency: options.currency ?? 'INR',
      accept_partial: false,
      description: options.description.slice(0, 2048),
      reference_id: options.referenceId,
      customer: {
        name: options.customer.name,
        email: options.customer.email,
        contact: options.customer.contact,
      },
      notify: {
        email: Boolean(options.customer.email),
        sms: Boolean(options.customer.contact),
      },
      reminder_enable: true,
      notes: options.notes,
    });

    this.logger.log(
      `Created Razorpay payment link ${link.id} (ref ${options.referenceId ?? 'none'})`,
    );

    return { id: String(link.id), shortUrl: String(link.short_url) };
  }

  /**
   * Best-effort cancel of a Payment Link so the attendee can't pay a row that
   * was superseded or cancelled. Never throws: a link that's already paid,
   * expired or cancelled is fine, and a capture that slips through still lands
   * on the (cancelled) row for restore or refund.
   */
  async cancelPaymentLink(linkId: string): Promise<void> {
    try {
      await (this.razorpay as any).paymentLink.cancel(linkId);
      this.logger.log(`Cancelled Razorpay payment link ${linkId}`);
    } catch (err: any) {
      this.logger.warn(
        `cancelPaymentLink(${linkId}) failed: ${err?.error?.description ?? err?.message ?? String(err)}`,
      );
    }
  }

  /**
   * Refund a captured payment once per `key` (see {@link refundOnce}). `amount`
   * is in rupees. Throws if no refund went out — callers decide how to treat
   * that (log, queue for retry, surface to an admin); retrying is always safe.
   */
  async refund(
    paymentId: string,
    amount: number,
    key: string,
    notes: Record<string, string> = {},
  ): Promise<string> {
    const id = await refundOnce(this.razorpay, paymentId, amount, key, notes);
    this.logger.log(`Refund ${id} (${key}) for payment ${paymentId}`);
    return id;
  }

  /**
   * Fetch every payment attempt Razorpay recorded against an order, newest
   * first. Used to reconcile a registration whose status never updated (e.g. a
   * missed webhook): the caller inspects `status` to decide PAID vs FAILED.
   * `status` is Razorpay's own value — `captured`, `failed`, `authorized`,
   * `created`, `refunded`. `amount` is in paise.
   */
  async fetchOrderPayments(
    orderId: string,
  ): Promise<
    Array<{ id: string; status: string; amount: number; amountRefunded: number }>
  > {
    const res = await this.razorpay.orders.fetchPayments(orderId);
    const items = (res as { items?: any[] }).items ?? [];
    return items.map((p) => ({
      id: String(p.id),
      status: String(p.status),
      amount: Number(p.amount),
      amountRefunded: Number(p.amount_refunded ?? 0),
    }));
  }

  /**
   * Fetch one payment by id. Used to reconcile a registration whose paid order
   * was orphaned by a later retry (each retry overwrites `registration.orderId`,
   * so the current order has no payment) — the admin supplies the payment id
   * they can see in the Razorpay dashboard. `notes` carries whatever the order
   * was created with (we store `registrationId`), so the caller can verify the
   * payment really belongs to the registration before acting on it. Amounts are
   * in paise; `amountRefunded` reflects any refund already issued in Razorpay.
   */
  async fetchPayment(paymentId: string): Promise<{
    id: string;
    orderId: string | null;
    status: string;
    amount: number;
    amountRefunded: number;
    currency: string;
    notes: Record<string, string>;
  }> {
    const p = (await this.razorpay.payments.fetch(paymentId)) as any;
    return {
      id: String(p.id),
      orderId: p.order_id ? String(p.order_id) : null,
      status: String(p.status),
      amount: Number(p.amount),
      currency: String(p.currency ?? 'INR'),
      amountRefunded: Number(p.amount_refunded ?? 0),
      notes: (p.notes ?? {}) as Record<string, string>,
    };
  }

  /** The `notes` an order was created with (we store `registrationId` there). */
  async fetchOrderNotes(orderId: string): Promise<Record<string, string>> {
    const o = (await this.razorpay.orders.fetch(orderId)) as any;
    return (o.notes ?? {}) as Record<string, string>;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Reconciliation reads. These pull Razorpay's own record of what happened —
  // payments captured, refunds issued, and settlements deposited to the
  // platform bank — so an admin can compare them against the platform ledger.
  // Razorpay caps `count` at 100 per page, so each helper walks pages until a
  // short page is returned. `from`/`to` are UNIX seconds (Razorpay's format).
  // ───────────────────────────────────────────────────────────────────────

  /** Default max pages to walk (100 rows each) — a cap against runaway ranges. */
  private readonly RECON_MAX_PAGES = 25;
  /** Higher cap for the all-time balance sweep (which spans the whole account). */
  readonly RECON_BALANCE_MAX_PAGES = 60;

  /**
   * Walk a Razorpay "list" endpoint page by page over a time window, returning
   * every item plus whether the page cap was hit (i.e. results may be truncated).
   * `fetchPage` receives the pagination window and returns the raw `{ items }`
   * payload for that page.
   */
  private async paginateAll(
    fetchPage: (opts: { from: number; to: number; count: number; skip: number }) => Promise<any>,
    from: number,
    to: number,
    maxPages: number = this.RECON_MAX_PAGES,
  ): Promise<{ items: any[]; truncated: boolean }> {
    const count = 100;
    const all: any[] = [];
    let truncated = false;
    for (let page = 0; page < maxPages; page++) {
      const res = await fetchPage({ from, to, count, skip: page * count });
      const items = (res?.items ?? []) as any[];
      all.push(...items);
      if (items.length < count) break; // last page
      if (page === maxPages - 1) truncated = true; // hit the cap with a full page
    }
    return { items: all, truncated };
  }

  /**
   * Every payment Razorpay recorded in [from, to]. Amounts are in paise;
   * `status` is Razorpay's (`captured`, `failed`, `authorized`, `refunded`, …).
   * `fee`/`tax` are what Razorpay charged on the payment. `truncated` is true if
   * the page cap was reached (the range had more than we fetched).
   */
  async listPayments(from: number, to: number, maxPages?: number) {
    const { items, truncated } = await this.paginateAll(
      (o) => this.razorpay.payments.all(o) as Promise<any>,
      from,
      to,
      maxPages,
    );
    const rows = items.map((p) => ({
      id: String(p.id),
      orderId: p.order_id ? String(p.order_id) : null,
      status: String(p.status),
      amount: Number(p.amount),
      amountRefunded: Number(p.amount_refunded ?? 0),
      fee: Number(p.fee ?? 0),
      tax: Number(p.tax ?? 0),
      method: p.method ? String(p.method) : null,
      email: p.email ? String(p.email) : null,
      contact: p.contact ? String(p.contact) : null,
      createdAt: Number(p.created_at) * 1000, // → ms
      notes: (p.notes ?? {}) as Record<string, string>,
    }));
    return Object.assign(rows, { truncated });
  }

  /**
   * Every refund Razorpay recorded in [from, to]. Amounts in paise; `paymentId`
   * ties the refund back to its payment.
   */
  async listRefunds(from: number, to: number, maxPages?: number) {
    const { items } = await this.paginateAll(
      (o) => this.razorpay.refunds.all(o) as Promise<any>,
      from,
      to,
      maxPages,
    );
    return items.map((r) => ({
      id: String(r.id),
      paymentId: r.payment_id ? String(r.payment_id) : null,
      amount: Number(r.amount),
      status: r.status ? String(r.status) : null,
      createdAt: Number(r.created_at) * 1000,
      notes: (r.notes ?? {}) as Record<string, string>,
    }));
  }

  /**
   * Every settlement Razorpay deposited to the platform bank in [from, to].
   * This is the "money that actually reached my account" view — a settlement
   * batches many payments minus Razorpay's fees/GST. Amounts in paise; `utr`
   * is the bank reference.
   */
  async listSettlements(from: number, to: number, maxPages?: number) {
    const { items } = await this.paginateAll(
      (o) => (this.razorpay as any).settlements.all(o) as Promise<any>,
      from,
      to,
      maxPages,
    );
    return items.map((s) => ({
      id: String(s.id),
      status: s.status ? String(s.status) : null,
      amount: Number(s.amount), // net deposited
      fees: Number(s.fees ?? 0),
      tax: Number(s.tax ?? 0),
      utr: s.utr ? String(s.utr) : null,
      createdAt: Number(s.created_at) * 1000,
    }));
  }

  /**
   * Verify the checkout signature Razorpay returns to the client after a
   * successful payment. Returns true only if the HMAC of `orderId|paymentId`
   * (keyed by the secret) matches, using a constant-time comparison to avoid
   * leaking timing information.
   */
  verifyPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string,
  ): boolean {
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    return this.safeEqual(expected, signature);
  }

  /**
   * Verify a Razorpay webhook payload against the webhook secret. `rawBody`
   * must be the exact bytes Razorpay signed (not a re-serialised object).
   */
  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(rawBody)
      .digest('hex');
    return this.safeEqual(expected, signature);
  }

  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }
}
