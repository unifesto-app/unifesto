import type { TransactionRow } from './api/transactions';

/** What one row contributes to the money tiles, in rupees. */
export interface RowMoney {
  collected: number;
  fee: number;
  refunded: number;
  /** Amount on an order that hasn't been paid yet. */
  pending: number;
}

export interface TransactionSummary extends RowMoney {
  net: number;
  paidCount: number;
}

/** Money fields arrive as Decimal strings; `+=` on those would concatenate. */
export const num = (v: number | string | null | undefined) => Number(v) || 0;

/**
 * Split one registration into collected / fee / refunded / pending.
 *
 * This should agree with the server's transactions export (the CSV the same
 * screen downloads), so an operator never sees one Net on the phone and a
 * different one in the spreadsheet. See the "Money model" comment in
 * backend/src/registrations/registrations.service.ts (transactions export).
 */
export function rowMoney(r: TransactionRow): RowMoney {
  // Only captured payments moved money. Refunds are base-only, so a fully
  // refunded row nets to 0 (collected − fee − refunded), never below.
  if (CAPTURED.has(r.paymentStatus)) {
    return { collected: num(r.totalAmount), fee: num(r.processingFee), refunded: num(r.refundedAmount), pending: 0 };
  }
  // An open order: shown as awaiting payment, never counted as revenue.
  if (r.paymentStatus === 'PENDING') return { collected: 0, fee: 0, refunded: 0, pending: num(r.totalAmount) };
  // FAILED (or anything unknown) moved nothing.
  return { collected: 0, fee: 0, refunded: 0, pending: 0 };
}

const CAPTURED = new Set(['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']);

export function summarize(rows: TransactionRow[]): TransactionSummary {
  const s: TransactionSummary = { collected: 0, fee: 0, refunded: 0, pending: 0, net: 0, paidCount: 0 };
  for (const r of rows) {
    const m = rowMoney(r);
    s.collected += m.collected;
    s.fee += m.fee;
    s.refunded += m.refunded;
    s.pending += m.pending;
    if (m.collected > 0) s.paidCount += 1;
  }
  s.net = s.collected - s.fee - s.refunded;
  return s;
}
