import { call } from './manageEvent';

/*
 * Space finance, mobile side. Every endpoint here is Space-Admin-only on the
 * server (assertSpaceAdmin / organiser checks), so screens reach them only
 * from a space where the user is a Space Admin.
 */

// ── Summary ──────────────────────────────────────────────────────────────────

/**
 * Cash-accurate roll-up. Cumulative figures survive refunds; the payout
 * figures reconcile as netEntitlement = settled + pending + available.
 */
export interface Financials {
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

/** GET /payouts/space/:spaceId/financials */
export const getSpaceFinancials = (spaceId: string) => call<Financials>(`/payouts/space/${spaceId}/financials`);

// ── Payouts ──────────────────────────────────────────────────────────────────

export type PayoutStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type PayoutMethodType = 'BANK' | 'UPI';

export interface Payout {
  id: string;
  eventId: string;
  grossRevenue: string;
  platformFeePercent: string;
  platformFee: string;
  netAmount: string;
  status: PayoutStatus;
  createdAt: string;
  completedAt: string | null;
  failureReason: string | null;
  utr: string | null;
  notes: string | null;
  event?: { id: string; title: string; slug: string } | null;
  user?: { id: string; fullName: string | null; username: string | null } | null;
  bankAccount?: {
    methodType?: PayoutMethodType;
    bankName: string | null;
    accountNumber: string | null;
    upiId: string | null;
    accountHolderName?: string;
  } | null;
}

/** GET /payouts/space/:spaceId — every payout for the space's events. */
export async function getSpacePayouts(spaceId: string) {
  const res = await call<{ payouts: Payout[] }>(`/payouts/space/${spaceId}`);
  return res.ok ? { ...res, data: res.data?.payouts ?? [] } : res;
}

/**
 * Balance for one event. Only the balance fields are used: the server's
 * `grossRevenue` / `registrationCount` are scoped to events the caller created,
 * so they read 0 for other Space Admins.
 */
export interface EventPayoutSummary {
  eventId: string;
  defaultPlatformFeePercent: number;
  estimatedPlatformFee: number;
  eventNet: number;
  committed: number;
  available: number;
}

/** GET /payouts/event/:eventId/summary */
export const getEventPayoutSummary = (eventId: string) => call<EventPayoutSummary>(`/payouts/event/${eventId}/summary`);

export interface EligibleAccount {
  id: string;
  methodType: PayoutMethodType;
  accountHolderName: string;
  bankName: string | null;
  accountNumberLast4: string | null;
  upiId: string | null;
  isPrimary: boolean;
  ownerId: string;
  ownerName: string;
  /** Belongs to the event creator rather than another Space Admin. */
  isOwn: boolean;
}

/** GET /payouts/event/:eventId/eligible-accounts — verified accounts this event can pay into. */
export const getEligibleAccounts = (eventId: string) =>
  call<{ selectedBankAccountId: string | null; accounts: EligibleAccount[] }>(`/payouts/event/${eventId}/eligible-accounts`);

/** POST /payouts/request — omit `amount` for the whole available balance. */
export const requestPayout = (eventId: string, amount?: number, bankAccountId?: string) =>
  call<Payout>('/payouts/request', {
    method: 'POST',
    body: JSON.stringify({ eventId, ...(amount != null ? { amount } : {}), ...(bankAccountId ? { bankAccountId } : {}) }),
  });

// ── Payout accounts ──────────────────────────────────────────────────────────

export type BankAccountStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface BankAccount {
  id: string;
  methodType: PayoutMethodType;
  accountHolderName: string;
  accountNumber: string | null;
  ifscCode: string | null;
  bankName: string | null;
  upiId: string | null;
  status: BankAccountStatus;
  isPrimary: boolean;
  rejectionReason: string | null;
  createdAt: string;
}

/** GET /payouts/bank-accounts — the signed-in user's own payout methods. */
export const getMyBankAccounts = () => call<BankAccount[]>('/payouts/bank-accounts');

export interface NewBankAccount {
  accountHolderName: string;
  mobileNumber: string;
  accountNumber: string;
  ifscCode: string;
  bankName: string;
  accountType: 'savings' | 'current';
  isPrimary: boolean;
}

/**
 * POST /payouts/bank-accounts — bank transfer only (the server rejects UPI).
 * Starts as PENDING until a Unifesto admin verifies it. There is no edit: a
 * wrong account is removed and added again.
 */
export const addBankAccount = (body: NewBankAccount) =>
  call<BankAccount>('/payouts/bank-accounts', {
    method: 'POST',
    body: JSON.stringify({ methodType: 'BANK', ...body }),
  });

/** DELETE /payouts/bank-accounts/:id */
export const deleteBankAccount = (id: string) => call<unknown>(`/payouts/bank-accounts/${id}`, { method: 'DELETE' });

/** "HDFC Bank ••4821" or "name@upi". Never shows a full account number. */
export function describeAccount(a: {
  methodType?: PayoutMethodType;
  bankName: string | null;
  upiId: string | null;
  accountNumber?: string | null;
  accountNumberLast4?: string | null;
}) {
  if (a.methodType === 'UPI' || (!a.bankName && a.upiId)) return a.upiId ?? 'UPI';
  const last4 = a.accountNumberLast4 ?? a.accountNumber?.slice(-4);
  return [a.bankName ?? 'Bank account', last4 ? `••${last4}` : null].filter(Boolean).join(' ');
}

// ── Refunds ──────────────────────────────────────────────────────────────────

/** REFUND_FAILED: Razorpay failed it later; still owed, an admin sends it again. */
export type RefundStatus = 'PENDING_CURATOR' | 'PENDING_ADMIN' | 'PROCESSING' | 'APPROVED' | 'REJECTED' | 'REFUND_FAILED';

export interface RefundRequest {
  id: string;
  registrationId: string;
  eventId: string;
  requesterRole: 'ATTENDEE' | 'CURATOR' | 'ADMIN';
  reason: string;
  requestedAmount: string | null;
  status: RefundStatus;
  curatorNote: string | null;
  curatorActionAt: string | null;
  adminNote: string | null;
  adminActionAt: string | null;
  approvedAmount: string | null;
  cashRefunded: string;
  /** Server cap: booking base plus a group's extra-seats payments still refundable. */
  maxRefundable?: number;
  createdAt: string;
  updatedAt?: string;
  registration?: {
    id: string;
    totalAmount: string;
    processingFee: string;
    refundedAmount: string;
    paymentStatus: string;
    user?: { id: string; fullName: string | null; username: string | null };
    ticketType?: { name: string } | null;
  };
  event?: { id: string; title: string; slug: string; space?: { id: string; name: string } };
  requestedBy?: { id: string; fullName: string | null; username: string | null };
}

export interface RefundPage {
  requests: RefundRequest[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/** GET /refunds/curator/queue — requests on this space's events. */
export function getRefundQueue(spaceId: string, opts: { status?: RefundStatus; page?: number; limit?: number }) {
  const q = new URLSearchParams({ spaceId, page: String(opts.page ?? 1), limit: String(opts.limit ?? 30) });
  if (opts.status) q.set('status', opts.status);
  return call<RefundPage>(`/refunds/curator/queue?${q.toString()}`);
}

/** GET /refunds/:id */
export const getRefund = (id: string) => call<RefundRequest>(`/refunds/${id}`);

/**
 * PATCH /refunds/:id/curator-review — FORWARD sends it to the Unifesto admin to
 * approve and pay; REJECT needs a reason, which the attendee sees.
 */
export const reviewRefund = (id: string, action: 'FORWARD' | 'REJECT', note?: string) =>
  call<RefundRequest>(`/refunds/${id}/curator-review`, {
    method: 'PATCH',
    body: JSON.stringify({ action, ...(note ? { note } : {}) }),
  });
