/**
 * Free-attendee-add request API — organiser asks to add attendees for free
 * (comp a paid ticket) on one event; a platform admin approves/rejects.
 *
 * Backed by the NestJS `/free-attendee-add` controller. An approval grants a
 * number of free seats (one ticket type or any) that every comp draws down,
 * and can be revoked (A27). Mirrors white-label-api.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";
import type { RequestStatus, RequestUser } from "./requests-api";

/** A free-add request can also be REVOKED: an approval withdrawn. */
export type FreeAddStatus = RequestStatus | "REVOKED";

export interface FreeAddRequest {
  id: string;
  eventId: string;
  event: { id: string; title: string; slug: string } | null;
  spaceId: string;
  space: { id: string; name: string; slug: string } | null;
  requestedBy: string;
  requester: RequestUser;
  reason: string;
  status: FreeAddStatus;
  ticketTypeId: string | null;
  ticketType: { id: string; name: string } | null;
  requestedSeats: number | null;
  /** Seats granted; null on an old approval = unlimited. */
  approvedSeats: number | null;
  usedSeats: number;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FreeAddRequestsResponse {
  requests: FreeAddRequest[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/** `GET /free-attendee-add/requests?status=` — admin inbox. */
export async function getFreeAddRequests(
  status?: FreeAddStatus,
  page = 1,
  limit = 50
): Promise<{ data: FreeAddRequestsResponse | null; error: ApiError | null }> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  params.set("page", String(page));
  params.set("limit", String(limit));
  return apiCall<FreeAddRequestsResponse>(
    backendClient.get(`/free-attendee-add/requests?${params.toString()}`)
  );
}

/** `PATCH /free-attendee-add/requests/:id/review`. Approving needs a seat count. */
export async function reviewFreeAddRequest(
  id: string,
  status: "APPROVED" | "REJECTED",
  opts: { reviewNote?: string; approvedSeats?: number } = {}
): Promise<{ data: unknown | null; error: ApiError | null }> {
  return apiCall(
    backendClient.patch(`/free-attendee-add/requests/${id}/review`, {
      status,
      ...opts,
    })
  );
}

/** `PATCH /free-attendee-add/requests/:id/revoke`: no more free seats from it. */
export async function revokeFreeAddRequest(
  id: string,
  reviewNote?: string
): Promise<{ data: unknown | null; error: ApiError | null }> {
  return apiCall(
    backendClient.patch(`/free-attendee-add/requests/${id}/revoke`, { reviewNote })
  );
}
