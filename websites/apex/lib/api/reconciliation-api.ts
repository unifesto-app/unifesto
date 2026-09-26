/**
 * Reconciliation API — lines the platform ledger up against Razorpay's own
 * record of payments, refunds, and settlements (money deposited to the bank).
 * Admin-only, fetched live from Razorpay. Backed by `/admin/reconciliation/*`.
 * All amounts are in rupees.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export interface ReconWindow {
  from: string;
  to: string;
}

/** Optional date window (ISO `YYYY-MM-DD`). Omit for the last 30 days. */
export interface ReconRange {
  from?: string;
  to?: string;
}

function params(range?: ReconRange) {
  const p: Record<string, string> = {};
  if (range?.from) p.from = range.from;
  if (range?.to) p.to = range.to;
  return p;
}

// ── Summary ────────────────────────────────────────────────────────────────

export interface ReconSummary {
  window: ReconWindow;
  razorpay: {
    capturedCount: number;
    captured: number;
    refunded: number;
    fees: number;
    net: number;
    settledToBank: number;
    settlementCount: number;
  };
  platform: {
    paidCount: number;
    captured: number;
    refunded: number;
    processingFees: number;
  };
  diff: { captured: number; refunded: number };
}

export async function getReconSummary(
  range?: ReconRange
): Promise<{ data: ReconSummary | null; error: ApiError | null }> {
  return apiCall<ReconSummary>(
    backendClient.get("/admin/reconciliation/summary", { params: params(range) })
  );
}

// ── Razorpay balance (all-time, window-independent) ──────────────────────────

export interface ReconBalance {
  asOf: string;
  /** Money still held at Razorpay: captured − fees − refunds − settled. */
  balance: number;
  captured: number;
  fees: number;
  refunded: number;
  settled: number;
  /** True if account history exceeded the sweep cap (balance is a lower bound). */
  approximate: boolean;
}

/** Money still sitting in Razorpay, not yet settled. `GET /admin/reconciliation/balance`. */
export async function getReconBalance(): Promise<{
  data: ReconBalance | null;
  error: ApiError | null;
}> {
  return apiCall<ReconBalance>(backendClient.get("/admin/reconciliation/balance"));
}

// ── Payments (line-by-line) ──────────────────────────────────────────────────

export type ReconPaymentStatus =
  | "MATCHED"
  | "MISSING_IN_PLATFORM"
  | "MISSING_IN_RAZORPAY"
  | "RAZORPAY_UNCAPTURED";

export interface ReconPaymentRow {
  paymentId: string;
  orderId: string | null;
  razorpayStatus: string | null;
  razorpayAmount: number | null;
  razorpayRefunded: number | null;
  method: string | null;
  contact: string | null;
  createdAt: string | null;
  platform: {
    source: "EVENT" | "SESSION";
    registrationId: string;
    title: string;
    paymentStatus: string;
    amount: number;
  } | null;
  status: ReconPaymentStatus;
  amountMismatch: boolean;
  /** Event registration to deep-link to (reconcile / view); null for sessions
   *  or when it can't be resolved. */
  reconcileRegistrationId: string | null;
}

export interface ReconPayments {
  window: ReconWindow;
  counts: {
    total: number;
    matched: number;
    missingInPlatform: number;
    missingInRazorpay: number;
    amountMismatch: number;
  };
  rows: ReconPaymentRow[];
}

export async function getReconPayments(
  range?: ReconRange
): Promise<{ data: ReconPayments | null; error: ApiError | null }> {
  return apiCall<ReconPayments>(
    backendClient.get("/admin/reconciliation/payments", { params: params(range) })
  );
}

// ── Orphaned / unsettled captured payments ───────────────────────────────────

export type OrphanClassification = "ORPHANED" | "UNSETTLED";

export interface OrphanSuggestion {
  registrationId: string;
  eventTitle: string;
  attendee: string;
}

export interface OrphanedPaymentRow {
  paymentId: string;
  orderId: string | null;
  /** Rupees. */
  amount: number;
  status: string;
  method: string | null;
  email: string | null;
  contact: string | null;
  createdAt: string;
  /** registrationId the payment was created against (from Razorpay notes). */
  notesRegistrationId: string | null;
  eventId: string | null;
  userId: string | null;
  /**
   * ORPHANED  — notes registration is gone; attach to `targetRegistrationId`
   *             (a suggested live pending reg) with `reassignOrphan`.
   * UNSETTLED — notes registration still PENDING; plain reconcile settles it.
   */
  classification: OrphanClassification;
  /** Registration the attach button acts on; null when no target was found. */
  targetRegistrationId: string | null;
  /** True → the attach call must pass reassignOrphan=true. */
  reassignOrphan: boolean;
  /** Present for ORPHANED rows with a resolved re-home target. */
  suggestion: OrphanSuggestion | null;
}

export interface OrphanedPayments {
  window: ReconWindow;
  counts: {
    total: number;
    orphaned: number;
    unsettled: number;
    /** Rows with no auto-resolved target — need manual handling. */
    unresolved: number;
  };
  rows: OrphanedPaymentRow[];
}

export async function getOrphanedPayments(
  range?: ReconRange
): Promise<{ data: OrphanedPayments | null; error: ApiError | null }> {
  return apiCall<OrphanedPayments>(
    backendClient.get("/admin/reconciliation/orphaned", { params: params(range) })
  );
}

// ── Refunds ──────────────────────────────────────────────────────────────────

export interface ReconRefundRow {
  refundId: string;
  paymentId: string | null;
  razorpayAmount: number;
  razorpayStatus: string | null;
  createdAt: string;
  platform: {
    refundRequestId: string;
    approvedAmount: number | null;
    status: string;
    title: string;
  } | null;
  status: "MATCHED" | "MISSING_IN_PLATFORM";
}

export interface ReconRefunds {
  window: ReconWindow;
  counts: { total: number; matched: number; missingInPlatform: number };
  rows: ReconRefundRow[];
}

export async function getReconRefunds(
  range?: ReconRange
): Promise<{ data: ReconRefunds | null; error: ApiError | null }> {
  return apiCall<ReconRefunds>(
    backendClient.get("/admin/reconciliation/refunds", { params: params(range) })
  );
}

// ── Settlements (Razorpay → bank) ─────────────────────────────────────────────

export interface ReconSettlementRow {
  id: string;
  status: string | null;
  amount: number;
  fees: number;
  tax: number;
  utr: string | null;
  settledAt: string;
}

export interface ReconSettlements {
  window: ReconWindow;
  totalSettled: number;
  count: number;
  rows: ReconSettlementRow[];
}

export async function getReconSettlements(
  range?: ReconRange
): Promise<{ data: ReconSettlements | null; error: ApiError | null }> {
  return apiCall<ReconSettlements>(
    backendClient.get("/admin/reconciliation/settlements", { params: params(range) })
  );
}
