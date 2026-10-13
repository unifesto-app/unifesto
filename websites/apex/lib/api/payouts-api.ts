/**
 * Payouts API — money released to organisers for their events. Transfers are
 * settled manually by an admin (no automated gateway); the UTR/reference is
 * recorded for reconciliation. Backed by the NestJS `/payouts` routes.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type PayoutStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface Payout {
  id: string;
  eventId: string;
  userId: string;
  grossRevenue: string;
  platformFeePercent: string;
  platformFee: string;
  netAmount: string;
  status: PayoutStatus;
  scheduledAt: string;
  processedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  utr: string | null;
  notes: string | null;
  createdAt: string;
  event?: { id: string; title: string; slug: string; startDateTime?: string };
  user?: { id: string; fullName: string | null; username: string | null };
  bankAccount?: {
    methodType?: PayoutMethodType;
    bankName: string | null;
    accountNumber: string | null;
    upiId: string | null;
    accountHolderName?: string;
  };
}

export interface PayoutListResponse {
  payouts: Payout[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/** Admin: all payouts across the platform. `GET /payouts/admin`. */
export async function getAllPayouts(params?: {
  page?: number;
  limit?: number;
  status?: PayoutStatus;
}): Promise<{ data: PayoutListResponse | null; error: ApiError | null }> {
  return apiCall<PayoutListResponse>(
    backendClient.get("/payouts/admin", { params })
  );
}

/**
 * Fetch every payout by walking the paginated admin endpoint — used for the
 * dashboard summary, where per-page totals aren't enough. Payout volume is low
 * (roughly one per event), so loading them all is cheap.
 */
export async function getAllPayoutsUnpaginated(
  status?: PayoutStatus
): Promise<{ data: Payout[] | null; error: ApiError | null }> {
  const PAGE = 100;
  const first = await getAllPayouts({ page: 1, limit: PAGE, status });
  if (first.error) return { data: null, error: first.error };
  if (!first.data) return { data: [], error: null };

  const { payouts, pagination } = first.data;
  if (pagination.totalPages <= 1) return { data: payouts, error: null };

  const rest = await Promise.all(
    Array.from({ length: pagination.totalPages - 1 }, (_, i) =>
      getAllPayouts({ page: i + 2, limit: PAGE, status })
    )
  );
  const all = [...payouts];
  for (const r of rest) {
    if (r.error) return { data: null, error: r.error };
    if (r.data) all.push(...r.data.payouts);
  }
  return { data: all, error: null };
}

/** Mark a payout settled, recording the manual UTR/reference. `POST /payouts/admin/:id/process`. */
export async function markPayoutPaid(
  id: string,
  payload?: { utr?: string; reference?: string }
): Promise<{ data: Payout | null; error: ApiError | null }> {
  return apiCall<Payout>(
    backendClient.post(`/payouts/admin/${id}/process`, payload ?? {})
  );
}

/** Cancel a pending payout. `PATCH /payouts/admin/:id/cancel`. */
export async function cancelPayout(
  id: string
): Promise<{ data: Payout | null; error: ApiError | null }> {
  return apiCall<Payout>(backendClient.patch(`/payouts/admin/${id}/cancel`));
}

// ── Bank accounts ──────────────────────────────────────────────────────────
// Organisers add a payout bank account; an admin verifies it. A VERIFIED
// primary account is required before the scheduler can queue payouts.

export type BankAccountStatus = "PENDING" | "VERIFIED" | "REJECTED";

/** A payout method is either a full bank account or a UPI handle. */
export type PayoutMethodType = "BANK" | "UPI";

export interface BankAccount {
  id: string;
  methodType: PayoutMethodType;
  /** Holder name (bank) or payee name (UPI). Set for both. */
  accountHolderName: string;
  /** Mobile number linked to the account / UPI. */
  mobileNumber: string | null;
  // Bank-only fields — null on a UPI method.
  accountNumber: string | null;
  ifscCode: string | null;
  bankName: string | null;
  accountType: string;
  // UPI-only field — null on a bank method.
  upiId: string | null;
  status: BankAccountStatus;
  isPrimary: boolean;
  rejectionReason: string | null;
  verifiedAt: string | null;
  createdAt: string;
  user?: {
    id: string;
    fullName: string | null;
    username: string | null;
    mobileNumber: string | null;
  };
}

export interface AddBankAccountPayload {
  methodType: PayoutMethodType;
  accountHolderName: string;
  mobileNumber: string;
  // Required when methodType === "BANK".
  accountNumber?: string;
  ifscCode?: string;
  bankName?: string;
  accountType?: string;
  // Required when methodType === "UPI".
  upiId?: string;
  isPrimary?: boolean;
}

/** Organiser: my payout bank accounts. `GET /payouts/bank-accounts`. */
export async function getMyBankAccounts(): Promise<{
  data: BankAccount[] | null;
  error: ApiError | null;
}> {
  return apiCall<BankAccount[]>(backendClient.get("/payouts/bank-accounts"));
}

/** Organiser: add a bank account. `POST /payouts/bank-accounts`. */
export async function addBankAccount(
  payload: AddBankAccountPayload
): Promise<{ data: BankAccount | null; error: ApiError | null }> {
  return apiCall<BankAccount>(
    backendClient.post("/payouts/bank-accounts", payload)
  );
}

/** Organiser: delete a bank account. `DELETE /payouts/bank-accounts/:id`. */
export async function deleteBankAccount(
  id: string
): Promise<{ data: { success?: boolean } | null; error: ApiError | null }> {
  return apiCall(backendClient.delete(`/payouts/bank-accounts/${id}`));
}

export interface BankAccountListResponse {
  accounts: BankAccount[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/** Admin: all organiser bank accounts. `GET /payouts/admin/bank-accounts`. */
export async function getAllBankAccounts(params?: {
  page?: number;
  limit?: number;
  status?: BankAccountStatus;
}): Promise<{ data: BankAccountListResponse | null; error: ApiError | null }> {
  return apiCall<BankAccountListResponse>(
    backendClient.get("/payouts/admin/bank-accounts", { params })
  );
}

/** Admin: verify or reject a bank account. `PATCH /payouts/admin/bank-accounts/:id/status`. */
export async function updateBankAccountStatus(
  id: string,
  payload: { status: "VERIFIED" | "REJECTED"; rejectionReason?: string }
): Promise<{ data: BankAccount | null; error: ApiError | null }> {
  return apiCall<BankAccount>(
    backendClient.patch(`/payouts/admin/bank-accounts/${id}/status`, payload)
  );
}

// ── Payout creation / request ──────────────────────────────────────────────

export interface EventPayoutSummary {
  eventId: string;
  registrationCount: number;
  grossRevenue: number;
  defaultPlatformFeePercent: number;
  estimatedPlatformFee: number;
  /** Organiser's total net entitlement for the event (gross − platform fee). */
  eventNet: number;
  /** Net already held by pending/processing/completed payouts. */
  committed: number;
  /** What a new payout can still draw — the custom-amount ceiling. */
  available: number;
  existingPayout: Payout | null;
}

/** Admin: net owed + any existing payout for an event. `GET /payouts/admin/event/:id/summary`. */
export async function getAdminEventPayoutSummary(
  eventId: string
): Promise<{ data: EventPayoutSummary | null; error: ApiError | null }> {
  return apiCall<EventPayoutSummary>(
    backendClient.get(`/payouts/admin/event/${eventId}/summary`)
  );
}

/** Organiser: net owed + any existing payout for one of my events. `GET /payouts/event/:id/summary`. */
export async function getEventPayoutSummary(
  eventId: string
): Promise<{ data: EventPayoutSummary | null; error: ApiError | null }> {
  return apiCall<EventPayoutSummary>(
    backendClient.get(`/payouts/event/${eventId}/summary`)
  );
}

/** Admin: create an on-demand payout for an event (auto-uses the organiser's
 *  verified primary account). `POST /payouts/admin/create-for-event`. */
export async function adminCreatePayoutForEvent(
  eventId: string,
  /** Custom net amount to transfer; omit to pay out the whole available balance. */
  amount?: number
): Promise<{ data: Payout | null; error: ApiError | null }> {
  return apiCall<Payout>(
    backendClient.post("/payouts/admin/create-for-event", {
      eventId,
      ...(amount != null ? { amount } : {}),
    })
  );
}

/** Organiser: request a payout for my own ended event. `POST /payouts/request`. */
export async function requestPayout(
  eventId: string,
  /** Custom net amount to request; omit to request the whole available balance. */
  amount?: number,
  /** Route this payout to a specific eligible account; omit to use the event
   *  default / creator's primary. */
  bankAccountId?: string
): Promise<{ data: Payout | null; error: ApiError | null }> {
  return apiCall<Payout>(
    backendClient.post("/payouts/request", {
      eventId,
      ...(amount != null ? { amount } : {}),
      ...(bankAccountId ? { bankAccountId } : {}),
    })
  );
}

// ── Per-event payout account (own + other space admins') ────────────────────────
// A space admin can route a particular event's earnings to another space admin's
// verified account — set a persisted default here, or override per request.

export interface EligibleAccount {
  id: string;
  methodType: PayoutMethodType;
  accountHolderName: string;
  bankName: string | null;
  /** Last 4 of the bank account number (null for UPI). */
  accountNumberLast4: string | null;
  upiId: string | null;
  isPrimary: boolean;
  ownerId: string;
  ownerName: string;
  /** True when the account belongs to the event creator (not another space admin). */
  isOwn: boolean;
}

export interface EligibleAccountsResponse {
  /** The event's persisted default account, if any. */
  selectedBankAccountId: string | null;
  accounts: EligibleAccount[];
}

/** Accounts an event's payout may be routed to. `GET /payouts/event/:id/eligible-accounts`. */
export async function getEventEligibleAccounts(
  eventId: string
): Promise<{ data: EligibleAccountsResponse | null; error: ApiError | null }> {
  return apiCall<EligibleAccountsResponse>(
    backendClient.get(`/payouts/event/${eventId}/eligible-accounts`)
  );
}

/** Set (or clear with null) the event's default payout account.
 *  `PATCH /payouts/event/:id/payout-account`. */
export async function setEventPayoutAccount(
  eventId: string,
  bankAccountId: string | null
): Promise<{
  data: { id: string; payoutBankAccountId: string | null } | null;
  error: ApiError | null;
}> {
  return apiCall(
    backendClient.patch(`/payouts/event/${eventId}/payout-account`, {
      bankAccountId,
    })
  );
}

// ── Financials summary (platform-wide) ──────────────────────────────────────
// Cash-accurate roll-up across every space. Figures reconcile as
// netEntitlement = settled + pending + available.

export interface PlatformFinancials {
  /** Gross ever paid, incl. the app processing fee (cumulative). */
  collectedOverall: number;
  /** The app processing fee the platform keeps. */
  processingFees: number;
  /** collectedOverall − processingFees (cumulative ticket revenue). */
  ticketRevenue: number;
  /** Cash returned by approved refunds. */
  refunded: number;
  /** Platform revenue-share cut summed across revenue-share spaces. */
  platformFee: number;
  /** Total net owed to organisers (current ticket revenue − platform fee). */
  netEntitlement: number;
  /** Already transferred to organisers (COMPLETED payouts). */
  settled: number;
  /** Queued for transfer (PENDING + PROCESSING payouts). */
  pending: number;
  /** Still owed but not yet paid (netEntitlement − settled − pending). */
  available: number;
  /** Paid out beyond net owed (refunds after a payout); to recover. */
  overdrawn: number;
  /** Platform take-home: processing fees + revenue-share cut. */
  platformEarnings: number;
}

/** Platform-wide financials. `GET /payouts/admin/financials`. */
export async function getPlatformFinancials(): Promise<{
  data: PlatformFinancials | null;
  error: ApiError | null;
}> {
  return apiCall<PlatformFinancials>(
    backendClient.get(`/payouts/admin/financials`)
  );
}

/** The cash-accurate figures shared by every level of the breakdown. */
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
  overdrawn: number;
}

/** One event's financials inside a space. */
export interface EventFinancials extends FinancialsFigures {
  eventId: string;
  title: string;
  slug: string;
  startDateTime: string;
}

/** One space's rolled-up financials plus its events. */
export interface SpaceFinancials extends FinancialsFigures {
  spaceId: string;
  name: string;
  slug: string;
  /** Revenue-share cut percent (0 for subscription/free spaces). */
  feePercent: number;
  billingModel: string | null;
  eventCount: number;
  /** This space's take-home: processing fees + its revenue-share cut. */
  platformEarnings: number;
  events: EventFinancials[];
}

/** Full platform breakdown: totals + every space (each with its events). */
export interface PlatformFinancialsBreakdown {
  totals: PlatformFinancials;
  spaces: SpaceFinancials[];
}

/** Per-space + per-event breakdown. `GET /payouts/admin/financials/breakdown`. */
export async function getPlatformFinancialsBreakdown(): Promise<{
  data: PlatformFinancialsBreakdown | null;
  error: ApiError | null;
}> {
  return apiCall<PlatformFinancialsBreakdown>(
    backendClient.get(`/payouts/admin/financials/breakdown`)
  );
}
