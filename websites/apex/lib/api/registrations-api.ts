/**
 * Registration transfer-request admin inbox.
 * Backed by `/registration-transfer-requests`.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

/** A ticket-transfer request (organiser → admin). */
export interface TransferRequest {
  id: string;
  targetEmail: string;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  registration: {
    id: string;
    groupSize: number | null;
    event: { id: string; title: string; slug: string; spaceId: string };
    ticketType: { id: string; name: string } | null;
    user: {
      id: string;
      fullName: string | null;
      username: string | null;
      identities?: { email: string | null }[];
    };
  };
  requester: { id: string; fullName: string | null; username: string | null };
}

export interface TransferRequestsResponse {
  requests: TransferRequest[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/** ADMIN: transfer-request inbox. `GET /registration-transfer-requests`. */
export async function getTransferRequests(
  status?: "PENDING" | "APPROVED" | "REJECTED",
  page = 1,
  limit = 50
): Promise<{ data: TransferRequestsResponse | null; error: ApiError | null }> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  params.set("page", String(page));
  params.set("limit", String(limit));
  return apiCall<TransferRequestsResponse>(
    backendClient.get(`/registration-transfer-requests?${params.toString()}`)
  );
}

/**
 * ADMIN: approve (performs the transfer) or reject a request, optionally
 * overriding the target email. `PATCH /registration-transfer-requests/:id/review`.
 */
export async function reviewTransferRequest(
  requestId: string,
  status: "APPROVED" | "REJECTED",
  opts?: { reviewNote?: string; email?: string }
): Promise<{ data: unknown | null; error: ApiError | null }> {
  return apiCall(
    backendClient.patch(
      `/registration-transfer-requests/${requestId}/review`,
      { status, reviewNote: opts?.reviewNote, email: opts?.email }
    )
  );
}
