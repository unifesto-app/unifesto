/**
 * Refunds API — two-stage refund requests (attendee → curator → admin).
 * Backed by the NestJS `/refunds` routes.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type RefundStatus =
  | "PENDING_CURATOR"
  | "PENDING_ADMIN"
  | "PROCESSING"
  | "APPROVED"
  | "REJECTED"
  /** Razorpay failed the refund later: still owed, approve again to re-send. */
  | "REFUND_FAILED";

export type RefundRequesterRole = "ATTENDEE" | "CURATOR" | "ADMIN";

interface UserRef {
  id: string;
  fullName: string | null;
  username: string | null;
}

export interface RefundRequest {
  id: string;
  registrationId: string;
  eventId: string;
  requesterRole: RefundRequesterRole;
  supportTicketId: string | null;
  reason: string;
  requestedAmount: string | null;
  status: RefundStatus;
  curatorNote: string | null;
  curatorActionAt: string | null;
  adminNote: string | null;
  adminActionAt: string | null;
  approvedAmount: string | null;
  cashRefunded: string;
  razorpayRefundId: string | null;
  /** Set when the refund exceeded what was left to pay out: recover from the space. */
  payoutShortfall?: string | null;
  /** What can still go back: booking base plus extra-seats payments (list endpoints). */
  maxRefundable?: number;
  createdAt: string;
  updatedAt: string;
  registration?: {
    id: string;
    totalAmount: string;
    processingFee: string;
    refundedAmount: string;
    paymentStatus: string;
    user?: UserRef;
  };
  event?: { id: string; title: string; slug: string };
  requestedBy?: UserRef;
}

export interface RefundListResponse {
  requests: RefundRequest[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface RefundListParams {
  status?: RefundStatus;
  page?: number;
  limit?: number;
}

/** Admin: every refund request across the platform. `GET /refunds/admin/all`. */
export async function getAllRefundRequests(
  params?: RefundListParams
): Promise<{ data: RefundListResponse | null; error: ApiError | null }> {
  return apiCall<RefundListResponse>(
    backendClient.get("/refunds/admin/all", { params })
  );
}

/** The current user's own refund requests. `GET /refunds/my`. */
export async function getMyRefundRequests(
  params?: { page?: number; limit?: number }
): Promise<{ data: RefundListResponse | null; error: ApiError | null }> {
  return apiCall<RefundListResponse>(
    backendClient.get("/refunds/my", { params })
  );
}

/** Full detail for one request. `GET /refunds/:id`. */
export async function getRefundRequest(
  id: string
): Promise<{ data: RefundRequest | null; error: ApiError | null }> {
  return apiCall<RefundRequest>(backendClient.get(`/refunds/${id}`));
}

/** Attendee/curator raises a request. `POST /refunds`. */
export async function createRefundRequest(payload: {
  registrationId: string;
  reason: string;
  requestedAmount?: number;
  supportTicketId?: string;
}): Promise<{ data: RefundRequest | null; error: ApiError | null }> {
  return apiCall<RefundRequest>(backendClient.post("/refunds", payload));
}

/** Admin decision — approve (optionally partial) or reject. `PATCH /refunds/:id/admin-decision`. */
export async function adminDecideRefund(
  id: string,
  payload: { action: "APPROVE" | "REJECT"; approvedAmount?: number; note?: string }
): Promise<{ data: RefundRequest | null; error: ApiError | null }> {
  return apiCall<RefundRequest>(
    backendClient.patch(`/refunds/${id}/admin-decision`, payload)
  );
}

/**
 * Admin raises and settles a refund directly for a paid registration, skipping
 * the attendee→curator stages. `POST /refunds/admin`.
 */
export async function adminRefund(payload: {
  registrationId: string;
  reason: string;
  approvedAmount?: number;
}): Promise<{ data: RefundRequest | null; error: ApiError | null }> {
  return apiCall<RefundRequest>(backendClient.post("/refunds/admin", payload));
}

/**
 * Send every refund a cancelled event owes: ticket prices (extra seats
 * included) and stays paid online. Safe to run again: it retries what failed.
 * `POST /refunds/admin/event/:eventId/refund-all`.
 */
export async function refundCancelledEvent(eventId: string): Promise<{
  data: {
    refunded: number;
    staysRefunded: number;
    failed: { id: string; kind: "ticket" | "stay"; error: string }[];
  } | null;
  error: ApiError | null;
}> {
  return apiCall(backendClient.post(`/refunds/admin/event/${eventId}/refund-all`));
}

/**
 * The base that can still be refunded (the processing fee is retained). Uses
 * the server's cap, which also counts a group's extra-seats payments.
 */
export function refundableBase(request: RefundRequest): number {
  if (request.maxRefundable != null) return Number(request.maxRefundable);
  const reg = request.registration;
  if (!reg) return 0;
  return (
    Number(reg.totalAmount) - Number(reg.processingFee) - Number(reg.refundedAmount)
  );
}

/** Approval claims stuck this long can be approved again (matches the backend). */
export const STUCK_PROCESSING_MS = 10 * 60_000;

/** An admin can send this request's refund (again): awaiting, failed, or stuck. */
export function canSendRefund(r: RefundRequest, now = Date.now()): boolean {
  return (
    r.status === "PENDING_ADMIN" ||
    r.status === "REFUND_FAILED" ||
    (r.status === "PROCESSING" && now - new Date(r.updatedAt).getTime() > STUCK_PROCESSING_MS)
  );
}
