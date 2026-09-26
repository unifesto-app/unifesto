/**
 * "Add attendees for free" exception requests (organiser → platform admin).
 * Comping a paid ticket in the manual-add flow is blocked per-event until a
 * Platform Admin approves one of these. Backed by `/free-attendee-add`.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type FreeAddRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface FreeAddRequest {
  id: string;
  eventId: string;
  spaceId: string;
  reason: string;
  status: FreeAddRequestStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  event?: { id: string; title: string; slug: string };
}

/** Raise a request to add attendees for free on an event. */
export async function createFreeAddRequest(
  eventId: string,
  reason: string
): Promise<{ data: FreeAddRequest | null; error: ApiError | null }> {
  return apiCall<FreeAddRequest>(
    backendClient.post("/free-attendee-add/requests", { eventId, reason })
  );
}

/** My free-add requests, optionally scoped to one event. */
export async function getMyFreeAddRequests(
  eventId?: string
): Promise<{ data: FreeAddRequest[] | null; error: ApiError | null }> {
  return apiCall<FreeAddRequest[]>(
    backendClient.get("/free-attendee-add/requests/my", {
      params: eventId ? { eventId } : undefined,
    })
  );
}
