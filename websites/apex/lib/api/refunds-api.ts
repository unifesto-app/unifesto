/**
 * Refunds API — two-stage refund requests (attendee → curator → admin).
 * Backed by the NestJS `/refunds` routes.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type RefundStatus =
  | "PENDING_CURATOR"
  | "PENDING_ADMIN"
  | "APPROVED"
  | "REJECTED";

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

/** The base amount (ticket price) that is refundable — the processing fee is retained. */
export function refundableBase(reg?: RefundRequest["registration"]): number {
  if (!reg) return 0;
  return (
    Number(reg.totalAmount) - Number(reg.processingFee) - Number(reg.refundedAmount)
  );
}
