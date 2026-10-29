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
  /** Exactly one of eventId / sessionId is set (T6). */
  eventId: string | null;
  sessionId?: string | null;
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
  event?: { id: string; title: string; slug: string; startDateTime?: string } | null;
  session?: { id: string; title: string; slug: string; startDateTime?: string } | null;
  user?: { id: string; fullName: string | null; username: string | null };
  bankAccount?: {
    methodType?: PayoutMethodType;
    bankName: string | null;
    accountNumber: string | null;
    upiId: string | null;
    accountHolderName?: string;
  };
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

/** Organiser: make a method my primary (the others lose it). `PATCH /payouts/bank-accounts/:id/primary`. */
export async function setPrimaryBankAccount(
  id: string
): Promise<{ data: BankAccount | null; error: ApiError | null }> {
  return apiCall<BankAccount>(backendClient.patch(`/payouts/bank-accounts/${id}/primary`));
}

/** Formats the backend enforces (A32). */
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const ACCOUNT_NUMBER_RE = /^\d{9,18}$/;
export const UPI_RE = /^[\w.\-]{2,}@[a-zA-Z]{2,}$/;

/** Organiser: delete a bank account. `DELETE /payouts/bank-accounts/:id`. */
export async function deleteBankAccount(
  id: string
): Promise<{ data: { success?: boolean } | null; error: ApiError | null }> {
  return apiCall(backendClient.delete(`/payouts/bank-accounts/${id}`));
}

// ── Payout creation / request ──────────────────────────────────────────────

/** What a payout draws from (T6): an event or a Huddle session. */
export interface PayoutTarget {
  kind: "event" | "session";
  id: string;
  title: string;
}

export interface EventPayoutSummary {
  eventId?: string;
  sessionId?: string;
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
  /** Paid out beyond the entitlement (refunds after a payout). */
  overdrawn?: number;
  existingPayout: Payout | null;
}

/** Net owed + any existing payout for an event or session. `GET /payouts/:kind/:id/summary`. */
export async function getPayoutSummary(
  target: Pick<PayoutTarget, "kind" | "id">
): Promise<{ data: EventPayoutSummary | null; error: ApiError | null }> {
  return apiCall<EventPayoutSummary>(
    backendClient.get(`/payouts/${target.kind}/${target.id}/summary`)
  );
}

/** An event's money, settled on the server at each sale's own fee (T6). */
export interface EventTransactions {
  /** Ever captured, buyer fee included. */
  collected: number;
  /** Buyer fees the platform kept. */
  buyerFees: number;
  refunded: number;
  /** Still held, before the organiser's platform fee. */
  gross: number;
  platformFee: number;
  /** What the organiser keeps. */
  net: number;
  pending: number;
  paidCount: number;
  count: number;
}

/** Transactions tiles, optionally for one ticket type. `GET /payouts/event/:id/transactions`. */
export async function getEventTransactions(
  eventId: string,
  ticketTypeId?: string
): Promise<{ data: EventTransactions | null; error: ApiError | null }> {
  return apiCall<EventTransactions>(
    backendClient.get(`/payouts/event/${eventId}/transactions`, {
      params: ticketTypeId ? { ticketTypeId } : undefined,
    })
  );
}

/** Request a payout for an event or session. `POST /payouts/request`. */
export async function requestPayout(
  target: Pick<PayoutTarget, "kind" | "id">,
  /** Custom net amount to request; omit to request the whole available balance. */
  amount?: number,
  /** Route this payout to a specific eligible account; omit to use the event
   *  default / creator's primary. */
  bankAccountId?: string
): Promise<{ data: Payout | null; error: ApiError | null }> {
  return apiCall<Payout>(
    backendClient.post("/payouts/request", {
      [target.kind === "session" ? "sessionId" : "eventId"]: target.id,
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

/** Accounts an event's (or session's) payout may be routed to. `GET /payouts/:kind/:id/eligible-accounts`. */
export async function getEventEligibleAccounts(
  id: string,
  kind: PayoutTarget["kind"] = "event"
): Promise<{ data: EligibleAccountsResponse | null; error: ApiError | null }> {
  return apiCall<EligibleAccountsResponse>(
    backendClient.get(`/payouts/${kind}/${id}/eligible-accounts`)
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

// ── Financials summary ──────────────────────────────────────────────────────
// A cash-accurate roll-up for the Financials page. Cumulative figures survive
// refunds; the payout figures reconcile as netEntitlement = settled + pending +
// available.

export interface Financials {
  /** Gross ever paid, incl. the app processing fee (cumulative). */
  collectedOverall: number;
  /** The app processing fee the platform keeps. */
  processingFees: number;
  /** collectedOverall − processingFees (cumulative ticket revenue). */
  ticketRevenue: number;
  /** Cash returned by approved refunds. */
  refunded: number;
  /** Platform revenue-share cut on retained revenue. */
  platformFee: number;
  /** Organiser net owed (current ticket revenue − platform fee). */
  netEntitlement: number;
  /** Already transferred (COMPLETED payouts). */
  settled: number;
  /** Queued for transfer (PENDING + PROCESSING payouts). */
  pending: number;
  /** Still available to request (netEntitlement − settled − pending). */
  available: number;
  /** Paid out beyond net owed (refunds after a payout). */
  overdrawn?: number;
}

/** Financials for the current space. `GET /payouts/space/:spaceId/financials`. */
export async function getSpaceFinancials(
  spaceId: string
): Promise<{ data: Financials | null; error: ApiError | null }> {
  return apiCall<Financials>(
    backendClient.get(`/payouts/space/${spaceId}/financials`)
  );
}

/**
 * Every payout for the current space's events — scoped to the space, not to
 * the caller's own createdBy events, so any space admin sees the full history.
 * `GET /payouts/space/:spaceId`.
 */
export async function getSpacePayouts(
  spaceId: string
): Promise<{ data: Payout[] | null; error: ApiError | null }> {
  const { data, error } = await apiCall<{ payouts: Payout[] }>(
    backendClient.get(`/payouts/space/${spaceId}`)
  );
  if (error) return { data: null, error };
  return { data: data?.payouts ?? [], error: null };
}
