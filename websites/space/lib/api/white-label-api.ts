/**
 * White-label API. Backed by the NestJS `/white-label` controller.
 *
 * Self-serve: a space whose plan includes `hasRemoveBranding` edits its theme
 * directly (Branding studio). Legacy requests are still returned in the
 * overview for history.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

/** A person attached to a request (applicant). */
export interface RequestUser {
  id: string;
  fullName: string | null;
  username: string | null;
  mobileNumber?: string | null;
  avatarUrl?: string | null;
  identities?: { email: string | null }[];
}

export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";

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
  /** Font presets a space can pick: stored key → Google Fonts family. */
  fonts: Record<BrandFontKey, string>;
}

/** `GET /white-label/spaces/:spaceId` — the space's white-label page data. */
export async function getWhiteLabelOverview(
  spaceId: string
): Promise<{ data: WhiteLabelOverview | null; error: ApiError | null }> {
  return apiCall<WhiteLabelOverview>(
    backendClient.get(`/white-label/spaces/${spaceId}`)
  );
}

/** Font preset key (e.g. "dm-sans"); the list comes from the overview's `fonts`. */
export type BrandFontKey = string;

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

type DomainPath = "email" | "web";

/** `POST /white-label/spaces/:spaceId/domains/:kind` — returns the DNS records to add. */
export async function addDomain(
  spaceId: string,
  kind: DomainPath,
  body: { hostname: string; localPart?: string }
): Promise<{ data: SpaceDomain | null; error: ApiError | null }> {
  return apiCall<SpaceDomain>(backendClient.post(`/white-label/spaces/${spaceId}/domains/${kind}`, body));
}

/** `POST /white-label/spaces/:spaceId/domains/:kind/verify` — check DNS now. */
export async function verifyDomain(
  spaceId: string,
  kind: DomainPath
): Promise<{ data: SpaceDomain | null; error: ApiError | null }> {
  return apiCall<SpaceDomain>(backendClient.post(`/white-label/spaces/${spaceId}/domains/${kind}/verify`));
}

/** `DELETE /white-label/spaces/:spaceId/domains/:kind`. */
export async function removeDomain(
  spaceId: string,
  kind: DomainPath
): Promise<{ data: unknown | null; error: ApiError | null }> {
  return apiCall(backendClient.delete(`/white-label/spaces/${spaceId}/domains/${kind}`));
}
