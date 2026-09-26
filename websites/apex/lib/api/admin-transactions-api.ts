/**
 * Admin transactions API — the platform-wide payments ledger.
 * Backed by `GET /admin/transactions`.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type TransactionPaymentStatus =
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export interface LedgerTransaction {
  id: string;
  totalAmount: string;
  processingFee: string;
  refundedAmount: string;
  paymentStatus: TransactionPaymentStatus;
  paymentId: string | null;
  orderId: string | null;
  paidAt: string | null;
  registeredAt: string;
  event: {
    id: string;
    title: string;
    slug: string;
    space: { id: string; name: string; slug: string };
  };
  ticketType: { name: string } | null;
  user: {
    id: string;
    fullName: string | null;
    username: string | null;
    email: string | null;
  };
}

export type RegistrationStatus =
  | "REGISTERED"
  | "WAITLISTED"
  | "CANCELLED"
  | "CHECKED_IN";

export interface TransactionTicket {
  id: string;
  ticketCode: string;
  attendeeName: string | null;
  attendeeEmail: string | null;
  status: string;
  checkedInAt: string | null;
}

export interface TransactionRefundRequest {
  id: string;
  status: string;
  reason: string;
  requestedAmount: string | null;
  approvedAmount: string | null;
  cashRefunded: string;
  requesterRole: string;
  createdAt: string;
}

/** Full transaction shape returned by `GET /admin/transactions/:id`. */
export interface TransactionDetail {
  id: string;
  quantity: number;
  groupSize: number | null;
  totalAmount: string;
  razorpayAmount: string;
  processingFee: string;
  refundedAmount: string;
  paymentStatus: TransactionPaymentStatus;
  paymentId: string | null;
  orderId: string | null;
  paidAt: string | null;
  status: RegistrationStatus;
  registeredAt: string;
  cancelledAt: string | null;
  ticketType: { name: string } | null;
  event: {
    id: string;
    title: string;
    slug: string;
    status: string;
    type: string;
    startDateTime: string;
  };
  space: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
  };
  organiser: {
    id: string;
    fullName: string | null;
    username: string | null;
    email: string | null;
  };
  user: {
    id: string;
    fullName: string | null;
    username: string | null;
    mobileNumber: string | null;
    email: string | null;
  };
  tickets: TransactionTicket[];
  refundRequests: TransactionRefundRequest[];
}

export interface TransactionsResponse {
  transactions: LedgerTransaction[];
  summary: { grossVolume: number; successful: number; failed: number };
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export async function getAdminTransactions(params?: {
  page?: number;
  limit?: number;
  status?: TransactionPaymentStatus;
  search?: string;
}): Promise<{ data: TransactionsResponse | null; error: ApiError | null }> {
  return apiCall<TransactionsResponse>(
    backendClient.get("/admin/transactions", { params })
  );
}

export async function getAdminTransaction(
  id: string
): Promise<{ data: { transaction: TransactionDetail } | null; error: ApiError | null }> {
  return apiCall<{ transaction: TransactionDetail }>(
    backendClient.get(`/admin/transactions/${id}`)
  );
}

/** Outcome of reconciling a stuck PENDING transaction against Razorpay. */
export interface ReconcileResult {
  registrationId: string;
  previousStatus: TransactionPaymentStatus;
  newStatus: TransactionPaymentStatus;
  changed: boolean;
  razorpayPaymentId?: string;
  detail: string;
}

/**
 * Reconcile a stuck PENDING transaction against Razorpay's own record and apply
 * the true outcome. `POST /admin/transactions/:id/reconcile`.
 *
 * Pass `paymentId` (the pay_… id from the Razorpay dashboard) when a payment
 * retry orphaned the order — the current order then has no payment and the
 * auto-scan finds nothing, but the real captured/refunded payment lives on the
 * earlier order.
 */
export async function reconcileTransaction(
  id: string,
  paymentId?: string,
  reassignOrphan?: boolean,
  allowAmountMismatch?: boolean
): Promise<{ data: ReconcileResult | null; error: ApiError | null }> {
  const body: {
    paymentId?: string;
    reassignOrphan?: boolean;
    allowAmountMismatch?: boolean;
  } = {};
  if (paymentId) body.paymentId = paymentId;
  if (reassignOrphan) body.reassignOrphan = true;
  if (allowAmountMismatch) body.allowAmountMismatch = true;
  return apiCall<ReconcileResult>(
    backendClient.post(`/admin/transactions/${id}/reconcile`, body)
  );
}

/**
 * Manually resolve a stuck PENDING transaction that reconcile can't settle —
 * an abandoned duplicate, or one whose real payment is on another registration.
 * Non-money outcomes only. `POST /admin/transactions/:id/resolve`.
 */
export async function resolveTransaction(
  id: string,
  payload: { outcome: "FAILED" | "CANCELLED"; note?: string }
): Promise<{ data: ReconcileResult | null; error: ApiError | null }> {
  return apiCall<ReconcileResult>(
    backendClient.post(`/admin/transactions/${id}/resolve`, payload)
  );
}
