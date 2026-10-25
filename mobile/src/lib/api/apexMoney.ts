import { call, type Result } from './manageEvent';
import type { AdminPayout, PayoutStatus } from './apex';
import type { BankAccount, BankAccountStatus, RefundRequest, RefundStatus } from './finance';

/*
 * Apex "Money & ops", mobile side: platform financials, the payments ledger,
 * Razorpay reconciliation, orphaned payments, payout-account verification and
 * refund history. Every route is @Roles(ADMIN). Shapes mirror
 * websites/apex/lib/api/{payouts,admin-transactions,reconciliation,refunds}-api.ts.
 */

type Page = { page: number; limit: number; total: number; totalPages: number };

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
};

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
const patch = (body: unknown): RequestInit => ({ method: 'PATCH', body: JSON.stringify(body) });

// ── Financials ───────────────────────────────────────────────────────────────
// Cash-accurate; netEntitlement = settled + pending + available at every level.

export interface FinancialsFigures {
  collectedOverall: number;
  processingFees: number;
  ticketRevenue: number;
  refunded: number;
  platformFee: number;
  netEntitlement: number;
  settled: number;
  pending: number;
  available: number;
}

export interface PlatformFinancials extends FinancialsFigures {
  platformEarnings: number;
}

export interface EventFinancials extends FinancialsFigures {
  eventId: string;
  title: string;
  slug: string;
  startDateTime: string;
}

export interface SpaceFinancials extends FinancialsFigures {
  spaceId: string;
  name: string;
  slug: string;
  feePercent: number;
  billingModel: string | null;
  eventCount: number;
  platformEarnings: number;
  events: EventFinancials[];
}

/** GET /payouts/admin/financials — totals only (fallback if the breakdown fails). */
export const getPlatformFinancials = () => call<PlatformFinancials>('/payouts/admin/financials');

/** GET /payouts/admin/financials/breakdown — totals + every space with its events. */
export const getPlatformFinancialsBreakdown = () =>
  call<{ totals: PlatformFinancials; spaces: SpaceFinancials[] }>('/payouts/admin/financials/breakdown');

// ── Transactions (payments ledger) ───────────────────────────────────────────

export type TxnStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';

interface NamedUser {
  id: string;
  fullName: string | null;
  username: string | null;
  email: string | null;
}

export interface LedgerTransaction {
  id: string;
  totalAmount: string;
  processingFee: string;
  refundedAmount: string;
  paymentStatus: TxnStatus;
  paymentId: string | null;
  orderId: string | null;
  paidAt: string | null;
  registeredAt: string;
  event: { id: string; title: string; slug: string; space: { id: string; name: string; slug: string } };
  ticketType: { name: string } | null;
  user: NamedUser;
}

export interface TransactionsPage {
  transactions: LedgerTransaction[];
  summary: { grossVolume: number; successful: number; failed: number };
  pagination: Page;
}

/** GET /admin/transactions — search matches reference, event or payer. */
export const getTransactions = (opts: { page?: number; limit?: number; status?: TxnStatus; search?: string }) =>
  call<TransactionsPage>(`/admin/transactions${qs({ page: opts.page, limit: opts.limit ?? 20, status: opts.status, search: opts.search })}`);

export interface TransactionDetail {
  id: string;
  quantity: number;
  groupSize: number | null;
  totalAmount: string;
  razorpayAmount: string;
  processingFee: string;
  refundedAmount: string;
  paymentStatus: TxnStatus;
  paymentId: string | null;
  orderId: string | null;
  paidAt: string | null;
  status: string;
  registeredAt: string;
  cancelledAt: string | null;
  ticketType: { name: string } | null;
  event: { id: string; title: string; slug: string; status: string; type: string; startDateTime: string };
  space: { id: string; name: string; slug: string; plan: string; status: string };
  organiser: NamedUser;
  user: NamedUser & { mobileNumber: string | null };
  tickets: {
    id: string;
    ticketCode: string;
    attendeeName: string | null;
    attendeeEmail: string | null;
    status: string;
    checkedInAt: string | null;
  }[];
  refundRequests: {
    id: string;
    status: string;
    reason: string;
    requestedAmount: string | null;
    approvedAmount: string | null;
    cashRefunded: string;
    requesterRole: string;
    createdAt: string;
  }[];
}

/** GET /admin/transactions/:id */
export const getTransaction = (id: string) => call<{ transaction: TransactionDetail }>(`/admin/transactions/${id}`);

export interface ReconcileResult {
  registrationId: string;
  previousStatus: TxnStatus;
  newStatus: TxnStatus;
  changed: boolean;
  razorpayPaymentId?: string;
  detail: string;
}

/**
 * POST /admin/transactions/:id/reconcile — settle a stuck PENDING registration
 * from Razorpay's record. `paymentId` covers a retried order; `reassignOrphan`
 * re-homes an orphaned capture; `allowAmountMismatch` is the explicit override.
 */
export const reconcileTransaction = (
  id: string,
  opts: { paymentId?: string; reassignOrphan?: boolean; allowAmountMismatch?: boolean } = {},
) =>
  call<ReconcileResult>(
    `/admin/transactions/${id}/reconcile`,
    post({
      paymentId: opts.paymentId || undefined,
      reassignOrphan: opts.reassignOrphan || undefined,
      allowAmountMismatch: opts.allowAmountMismatch || undefined,
    }),
  );

/** POST /admin/transactions/:id/resolve — non-money close-out of a stuck PENDING. */
export const resolveTransaction = (id: string, outcome: 'FAILED' | 'CANCELLED', note?: string) =>
  call<ReconcileResult>(`/admin/transactions/${id}/resolve`, post({ outcome, note: note || undefined }));

/** POST /refunds/admin — admin raises and settles a refund in one step (base only). */
export const adminRefund = (registrationId: string, reason: string, approvedAmount?: number) =>
  call<RefundRequest>('/refunds/admin', post({ registrationId, reason, approvedAmount }));

// ── Reconciliation (live from Razorpay, rupees) ──────────────────────────────

export interface ReconRange {
  from?: string;
  to?: string;
}

const range = (r?: ReconRange) => qs({ from: r?.from, to: r?.to });

// ── Orphaned / unsettled captures ────────────────────────────────────────────

export interface OrphanedPaymentRow {
  paymentId: string;
  orderId: string | null;
  amount: number;
  status: string;
  method: string | null;
  email: string | null;
  contact: string | null;
  createdAt: string;
  notesRegistrationId: string | null;
  eventId: string | null;
  userId: string | null;
  /** ORPHANED = its registration is gone; UNSETTLED = registration still PENDING (missed webhook). */
  classification: 'ORPHANED' | 'UNSETTLED';
  targetRegistrationId: string | null;
  reassignOrphan: boolean;
  suggestion: { registrationId: string; eventTitle: string; attendee: string } | null;
}

export interface OrphanedPayments {
  window: { from: string; to: string };
  counts: { total: number; orphaned: number; unsettled: number; unresolved: number };
  rows: OrphanedPaymentRow[];
}

export const getOrphanedPayments = (r?: ReconRange) => call<OrphanedPayments>(`/admin/reconciliation/orphaned${range(r)}`);

// ── Payout accounts ──────────────────────────────────────────────────────────

export type AdminBankAccount = BankAccount & {
  accountType?: string;
  mobileNumber: string | null;
  user?: { id: string; fullName: string | null; username: string | null; mobileNumber: string | null };
};

/** GET /payouts/admin/bank-accounts */
export const getAllBankAccounts = (opts: { status?: BankAccountStatus; page?: number; limit?: number }) =>
  call<{ accounts: AdminBankAccount[]; pagination: Page }>(
    `/payouts/admin/bank-accounts${qs({ status: opts.status, page: opts.page, limit: opts.limit ?? 30 })}`,
  );

/** PATCH /payouts/admin/bank-accounts/:id/status — the reason is shown to the organiser. */
export const setBankAccountStatus = (id: string, status: 'VERIFIED' | 'REJECTED', rejectionReason?: string) =>
  call<AdminBankAccount>(`/payouts/admin/bank-accounts/${id}/status`, patch({ status, rejectionReason }));

// ── Payouts (any status) & refunds (any status) ──────────────────────────────

/** GET /payouts/admin — omit status for every payout. */
export const listPayouts = (opts: { status?: PayoutStatus; page?: number; limit?: number }) =>
  call<{ payouts: AdminPayout[]; pagination: Page }>(`/payouts/admin${qs({ status: opts.status, page: opts.page, limit: opts.limit ?? 100 })}`);

/** GET /refunds/admin/all — omit status for the full history. */
export const listRefunds = (opts: { status?: RefundStatus; page?: number; limit?: number }) =>
  call<{ requests: RefundRequest[]; pagination: Page }>(`/refunds/admin/all${qs({ status: opts.status, page: opts.page, limit: opts.limit ?? 30 })}`);

/** Base (ticket price) still refundable — the processing fee is never refunded. */
export const refundableBase = (reg?: { totalAmount: string; processingFee: string; refundedAmount: string }) =>
  reg ? Number(reg.totalAmount) - Number(reg.processingFee) - Number(reg.refundedAmount) : 0;

export type { Result };
