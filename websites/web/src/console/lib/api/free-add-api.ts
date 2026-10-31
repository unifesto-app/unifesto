/**
 * "Add attendees for free" exception requests (organiser → platform admin).
 * Comping a paid ticket (single add, CSV import, adding group seats) needs an
 * approved request, which grants a number of free seats on one ticket type or
 * any (A27). Backed by `/free-attendee-add`.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type FreeAddRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";

export interface FreeAddRequest {
  id: string;
  eventId: string;
  spaceId: string;
  reason: string;
  status: FreeAddRequestStatus;
  /** One ticket type, or null = any ticket type on the event. */
  ticketTypeId: string | null;
  ticketType?: { id: string; name: string } | null;
  requestedSeats: number | null;
  /** Seats granted; null on an old approval = unlimited. */
  approvedSeats: number | null;
  usedSeats: number;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  event?: { id: string; title: string; slug: string };
}

/** Ask for `seats` free seats on an event, optionally on one ticket type only. */
export async function createFreeAddRequest(
  eventId: string,
  reason: string,
  opts: { seats?: number; ticketTypeId?: string } = {}
): Promise<{ data: FreeAddRequest | null; error: ApiError | null }> {
  return apiCall<FreeAddRequest>(
    backendClient.post("/free-attendee-add/requests", { eventId, reason, ...opts })
  );
}

/** Every free-add request on an event, whoever raised it. */
export async function getEventFreeAddRequests(
  eventId: string
): Promise<{ data: FreeAddRequest[] | null; error: ApiError | null }> {
  return apiCall<FreeAddRequest[]>(
    backendClient.get(`/free-attendee-add/events/${eventId}/requests`)
  );
}

/**
 * Free seats still available for a ticket type (same rule as the backend):
 * null = unlimited (an old approval), 0 = none.
 */
export function freeSeatsLeft(requests: FreeAddRequest[], ticketTypeId: string): number | null {
  const live = requests.filter(
    (r) => r.status === "APPROVED" && (r.ticketTypeId === null || r.ticketTypeId === ticketTypeId)
  );
  if (live.some((r) => r.approvedSeats === null)) return null;
  return live.reduce((n, r) => n + Math.max(0, (r.approvedSeats ?? 0) - r.usedSeats), 0);
}
