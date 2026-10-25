import { PaymentStatus, Prisma } from '@prisma/client';
import { platformShare } from '../subscription/plan-config.service';

/**
 * T6: the one place event money is settled. Payouts, financials, the Space
 * Transactions page, the transactions export and dashboard revenue all read
 * a sale through here, at the organiser fee frozen on that sale (A21 / T5), so
 * a deal edited later never rewrites the past.
 *
 * A row is a registration, an online stay or an add-on seat purchase, or a
 * groupBy of them keyed by paymentStatus + platformFeePercent (sums settle
 * the same way).
 */

type Money = Prisma.Decimal | number | string | null | undefined;

export interface SettleRow {
  paymentStatus: PaymentStatus | string | null;
  /** What the buyer was charged: base + buyer fee. */
  totalAmount: Money;
  /** The buyer fee: the platform keeps it, refunds never return it. */
  processingFee: Money;
  /** Returned to the buyer (base only). */
  refundedAmount: Money;
  /** Organiser fee % frozen on the sale; null = today's rate (`fallback`). */
  platformFeePercent: Money;
  /** An automatic full refund is still due: the money is not the organiser's. */
  refundDueAt?: Date | null;
}

/** Columns settle() reads. */
export const SETTLE_SELECT = {
  paymentStatus: true,
  totalAmount: true,
  processingFee: true,
  refundedAmount: true,
  platformFeePercent: true,
} as const;

/** Payment statuses where money was captured. */
const CAPTURED = new Set<string>([
  PaymentStatus.PAID,
  PaymentStatus.PARTIALLY_REFUNDED,
  PaymentStatus.REFUNDED,
]);

const num = (v: Money) => Number(v ?? 0) || 0;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** One sale. `base` is what the organiser still holds, before their fee. */
export function settleRow(r: SettleRow, fallbackPercent: number) {
  const captured = CAPTURED.has(r.paymentStatus ?? '');
  const collected = captured ? num(r.totalAmount) : 0;
  const buyerFee = captured ? num(r.processingFee) : 0;
  const refunded = captured ? num(r.refundedAmount) : 0;
  const base = r.refundDueAt ? 0 : Math.max(0, collected - buyerFee - refunded);
  const percent = r.platformFeePercent != null ? Number(r.platformFeePercent) : fallbackPercent;
  const platformFee = platformShare(base, percent);
  return { collected, buyerFee, refunded, base, percent, platformFee, net: base - platformFee };
}

/**
 * Organiser fee over many sales: their bases are summed per frozen rate and
 * rounded once per rate, so a total never drifts by a paisa per row.
 */
export function feeAtFrozenRates(
  sales: { net: number; percent: Prisma.Decimal | number | null }[],
  fallback: number,
): number {
  const netByRate = new Map<number, number>();
  for (const s of sales) {
    const rate = s.percent != null ? Number(s.percent) : fallback;
    netByRate.set(rate, (netByRate.get(rate) ?? 0) + s.net);
  }
  let fee = 0;
  for (const [rate, net] of netByRate) fee += platformShare(net, rate);
  return round2(fee);
}

export interface Settlement {
  /** Ever captured, buyer fee included. */
  collected: number;
  /** Buyer fees the platform kept. */
  buyerFees: number;
  /** Returned to buyers. */
  refunded: number;
  /** Still held for the organiser, before their fee: collected − buyer fees − refunded. */
  gross: number;
  /** The organiser's platform fee on `gross`, at each sale's frozen rate. */
  platformFee: number;
  /** What the organiser keeps: gross − platformFee. */
  net: number;
  /** On orders not paid yet. */
  pending: number;
  /** PAID rows (groups, when fed groupBy sums). */
  paidCount: number;
}

export function settle(rows: SettleRow[], fallbackPercent: number): Settlement {
  const s = { collected: 0, buyerFees: 0, refunded: 0, gross: 0, pending: 0, paidCount: 0 };
  const sales: { net: number; percent: number }[] = [];
  for (const r of rows) {
    if (r.paymentStatus === PaymentStatus.PENDING) s.pending += num(r.totalAmount);
    if (r.paymentStatus === PaymentStatus.PAID) s.paidCount += 1;
    const one = settleRow(r, fallbackPercent);
    s.collected += one.collected;
    s.buyerFees += one.buyerFee;
    s.refunded += one.refunded;
    s.gross += one.base;
    sales.push({ net: one.base, percent: one.percent });
  }
  const platformFee = feeAtFrozenRates(sales, fallbackPercent);
  return {
    collected: round2(s.collected),
    buyerFees: round2(s.buyerFees),
    refunded: round2(s.refunded),
    gross: round2(s.gross),
    platformFee,
    net: round2(s.gross - platformFee),
    pending: round2(s.pending),
    paidCount: s.paidCount,
  };
}
