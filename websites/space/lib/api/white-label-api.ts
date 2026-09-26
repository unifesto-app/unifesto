/**
 * White-label API — organiser accent-colour requests + admin review.
 *
 * Backed by the NestJS `/white-label` controller. An organiser requests
 * white-label for a space or one of its events; an admin approves/rejects; on
 * approval the branding is applied and the target's `whiteLabelEnabled` flips
 * on. Requires the space's plan to include `hasRemoveBranding`.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";
import type { RequestStatus, RequestUser } from "./requests-api";

export interface WhiteLabelRequest {
  id: string;
  spaceId: string;
  space: { id: string; name: string; slug: string; logoUrl: string | null };
  eventId: string | null;
  event: { id: string; title: string; slug: string } | null;
  requestedBy: string;
  requester: RequestUser;
  brandColor: string | null;
  reason: string;
  status: RequestStatus;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhiteLabelRequestsResponse {
  requests: WhiteLabelRequest[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreateWhiteLabelRequestInput {
  spaceId: string;
  /** Omit for a space-level request; set for an event-level one. */
  eventId?: string;
  brandColor: string;
  reason: string;
}

/** `POST /white-label/requests` — organiser submits a request. */
export async function createWhiteLabelRequest(
  input: CreateWhiteLabelRequestInput
): Promise<{ data: WhiteLabelRequest | null; error: ApiError | null }> {
  return apiCall<WhiteLabelRequest>(
    backendClient.post("/white-label/requests", input)
  );
}

/** `GET /white-label/requests/my` — this organiser's requests (optional space). */
export async function getMyWhiteLabelRequests(
  spaceId?: string
): Promise<{ data: WhiteLabelRequest[] | null; error: ApiError | null }> {
  const query = spaceId ? `?spaceId=${spaceId}` : "";
  return apiCall<WhiteLabelRequest[]>(
    backendClient.get(`/white-label/requests/my${query}`)
  );
}

/** Live white-label state of the space itself (source of truth, not requests). */
export interface SpaceWhiteLabelState {
  id: string;
  whiteLabelEnabled: boolean;
  brandColor: string | null;
  faviconUrl: string | null;
  emailFromName: string | null;
  emailReplyTo: string | null;
}

export interface EventWhiteLabelState {
  id: string;
  title: string;
  slug: string;
  status: string;
  startDateTime: string;
  whiteLabelEnabled: boolean;
  brandColor: string | null;
}

export interface WhiteLabelOverview {
  /** Whether the space's plan includes white-label (required to request/render). */
  planHasBranding: boolean;
  space: SpaceWhiteLabelState;
  events: EventWhiteLabelState[];
  /** Every request raised for this space (any co-admin), newest first. */
  requests: WhiteLabelRequest[];
}

/** `GET /white-label/spaces/:spaceId` — the space's white-label page data. */
export async function getWhiteLabelOverview(
  spaceId: string
): Promise<{ data: WhiteLabelOverview | null; error: ApiError | null }> {
  return apiCall<WhiteLabelOverview>(
    backendClient.get(`/white-label/spaces/${spaceId}`)
  );
}

/** `GET /white-label/requests?status=` — admin inbox, `{ requests, pagination }`. */
export async function getWhiteLabelRequests(
  status?: RequestStatus,
  page = 1,
  limit = 50
): Promise<{ data: WhiteLabelRequestsResponse | null; error: ApiError | null }> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  params.set("page", String(page));
  params.set("limit", String(limit));
  return apiCall<WhiteLabelRequestsResponse>(
    backendClient.get(`/white-label/requests?${params.toString()}`)
  );
}

/** `PATCH /white-label/requests/:id/review`. */
export async function reviewWhiteLabelRequest(
  id: string,
  status: "APPROVED" | "REJECTED",
  reviewNote?: string
): Promise<{ data: unknown | null; error: ApiError | null }> {
  return apiCall(
    backendClient.patch(`/white-label/requests/${id}/review`, {
      status,
      reviewNote,
    })
  );
}

export interface BrandingPatch {
  brandColor?: string;
  // Space-level surfaces (ignored on an event target). Effective only while the
  // space's white-label is enabled and the plan carries the perk.
  faviconUrl?: string;
  emailFromName?: string;
  emailReplyTo?: string;
}

/** `PATCH /white-label/spaces/:spaceId/branding` — edit an approved space. */
export async function updateSpaceBranding(
  spaceId: string,
  patch: BrandingPatch
): Promise<{ data: unknown | null; error: ApiError | null }> {
  return apiCall(
    backendClient.patch(`/white-label/spaces/${spaceId}/branding`, patch)
  );
}

/** `PATCH /white-label/events/:eventId/branding` — edit an approved event. */
export async function updateEventBranding(
  eventId: string,
  patch: BrandingPatch
): Promise<{ data: unknown | null; error: ApiError | null }> {
  return apiCall(
    backendClient.patch(`/white-label/events/${eventId}/branding`, patch)
  );
}

/** Admin apply/remove input — `enabled` toggles white-label on the target. */
export interface AdminApplyBrandingInput {
  enabled: boolean;
  /** A hex string sets the accent; `null` clears it; omit to leave untouched. */
  brandColor?: string | null;
}

export interface AdminApplyBrandingResult {
  id: string;
  whiteLabelEnabled: boolean;
  brandColor: string | null;
  /** True only when it will actually surface publicly right now. */
  willRender: boolean;
  /** Whether the owning space's plan currently includes white-label. */
  planHasBranding: boolean;
}

/**
 * `PATCH /white-label/admin/spaces/:spaceId` — admin directly applies (or
 * removes) white-label on a space, skipping the organiser request flow.
 */
export async function adminApplySpaceBranding(
  spaceId: string,
  input: AdminApplyBrandingInput
): Promise<{ data: AdminApplyBrandingResult | null; error: ApiError | null }> {
  return apiCall<AdminApplyBrandingResult>(
    backendClient.patch(`/white-label/admin/spaces/${spaceId}`, input)
  );
}

/** `PATCH /white-label/admin/events/:eventId` — admin applies/removes on an event. */
export async function adminApplyEventBranding(
  eventId: string,
  input: AdminApplyBrandingInput
): Promise<{ data: AdminApplyBrandingResult | null; error: ApiError | null }> {
  return apiCall<AdminApplyBrandingResult>(
    backendClient.patch(`/white-label/admin/events/${eventId}`, input)
  );
}
