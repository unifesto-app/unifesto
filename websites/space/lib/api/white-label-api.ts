/**
 * White-label API. Backed by the NestJS `/white-label` controller.
 *
 * Self-serve: a space whose plan includes `hasRemoveBranding` edits its theme
 * directly (Branding studio). The request/review calls remain for the legacy
 * admin history only.
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
  name: string;
  slug: string;
  logoUrl: string | null;
  whiteLabelEnabled: boolean;
  brandingSuspendedAt: string | null;
  brandColor: string | null;
  brandLogoUrl: string | null;
  brandFont: BrandFontKey | null;
  brandMode: "light" | "dark" | null;
  hidePoweredBy: boolean;
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
  /** Whether the space's plan includes white-label (required to edit/render). */
  planHasBranding: boolean;
  /** Switched on + plan + not suspended: attendees see it right now. */
  live: boolean;
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

/** Font presets; must match BRAND_FONTS in backend branding.util.ts. */
export const BRAND_FONTS = {
  inter: "Inter",
  "dm-sans": "DM Sans",
  "space-grotesk": "Space Grotesk",
  poppins: "Poppins",
  montserrat: "Montserrat",
  "ibm-plex-sans": "IBM Plex Sans",
  "playfair-display": "Playfair Display",
  lora: "Lora",
} as const;
export type BrandFontKey = keyof typeof BRAND_FONTS;

/** `null` clears a field, omitted leaves it. Events only take `brandColor`. */
export interface BrandingPatch {
  enabled?: boolean;
  brandColor?: string | null;
  brandFont?: BrandFontKey | null;
  brandMode?: "light" | "dark" | null;
  hidePoweredBy?: boolean;
  brandLogoUrl?: string | null;
  faviconUrl?: string | null;
  emailFromName?: string | null;
  emailReplyTo?: string | null;
}

/** `POST /white-label/spaces/:spaceId/assets/:kind` — upload wordmark or favicon. */
export async function uploadBrandAsset(
  spaceId: string,
  kind: "logo" | "favicon",
  file: File
): Promise<{ data: SpaceWhiteLabelState | null; error: ApiError | null }> {
  const formData = new FormData();
  formData.append("file", file);
  return apiCall<SpaceWhiteLabelState>(
    backendClient.post(`/white-label/spaces/${spaceId}/assets/${kind}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  );
}

/** `PATCH /white-label/spaces/:spaceId/branding` — edit the space theme. */
export async function updateSpaceBranding(
  spaceId: string,
  patch: BrandingPatch
): Promise<{ data: unknown | null; error: ApiError | null }> {
  return apiCall(
    backendClient.patch(`/white-label/spaces/${spaceId}/branding`, patch)
  );
}

/** `PATCH /white-label/events/:eventId/branding` — set/clear an event's accent. */
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


/** A DNS record the space must add, as the provider returned it. */
export interface DomainRecord {
  record: string;
  type: string;
  name: string;
  value: string;
  priority?: number;
  status: string;
}

export interface SpaceDomain {
  id: string;
  kind: "WEB" | "EMAIL";
  hostname: string;
  emailLocalPart: string | null;
  /** pending | verified | failed | not_started | partially_verified | ... */
  status: string;
  records: DomainRecord[];
  verifiedAt: string | null;
  lastCheckedAt: string | null;
}

/** `GET /white-label/spaces/:spaceId/domains` (re-checks pending ones). */
export async function getSpaceDomains(
  spaceId: string
): Promise<{ data: SpaceDomain[] | null; error: ApiError | null }> {
  return apiCall<SpaceDomain[]>(backendClient.get(`/white-label/spaces/${spaceId}/domains`));
}

/** `POST /white-label/spaces/:spaceId/domains/email` — returns the DNS records to add. */
export async function addEmailDomain(
  spaceId: string,
  hostname: string,
  localPart?: string
): Promise<{ data: SpaceDomain | null; error: ApiError | null }> {
  return apiCall<SpaceDomain>(
    backendClient.post(`/white-label/spaces/${spaceId}/domains/email`, { hostname, localPart })
  );
}

/** `POST /white-label/spaces/:spaceId/domains/email/verify` — check DNS now. */
export async function verifyEmailDomain(
  spaceId: string
): Promise<{ data: SpaceDomain | null; error: ApiError | null }> {
  return apiCall<SpaceDomain>(
    backendClient.post(`/white-label/spaces/${spaceId}/domains/email/verify`)
  );
}

/** `DELETE /white-label/spaces/:spaceId/domains/email`. */
export async function removeEmailDomain(
  spaceId: string
): Promise<{ data: unknown | null; error: ApiError | null }> {
  return apiCall(backendClient.delete(`/white-label/spaces/${spaceId}/domains/email`));
}
