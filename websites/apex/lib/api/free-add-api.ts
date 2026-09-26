/**
 * Free-attendee-add request API — organiser asks to add attendees for free
 * (comp a paid ticket) on one event; a platform admin approves/rejects.
 *
 * Backed by the NestJS `/free-attendee-add` controller. Approving flips the
 * event's `allowFreeAttendeeAdd` on. Mirrors white-label-api.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";
import type { RequestStatus, RequestUser } from "./requests-api";

export interface FreeAddRequest {
  id: string;
  eventId: string;
  event: { id: string; title: string; slug: string } | null;
  spaceId: string;
  space: { id: string; name: string; slug: string } | null;
  requestedBy: string;
  requester: RequestUser;
  reason: string;
  status: RequestStatus;
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
  status?: RequestStatus,
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

/** `PATCH /free-attendee-add/requests/:id/review`. */
export async function reviewFreeAddRequest(
  id: string,
  status: "APPROVED" | "REJECTED",
  reviewNote?: string
): Promise<{ data: unknown | null; error: ApiError | null }> {
  return apiCall(
    backendClient.patch(`/free-attendee-add/requests/${id}/review`, {
      status,
      reviewNote,
    })
  );
}
