import { call } from './manageEvent';

/*
 * White-label is colour-only: a space (and optionally each event) swaps
 * Unifesto blue for its own accent. An operator requests it, a Platform Admin
 * approves, and from then on the colour can be changed freely. Needs a plan
 * with white-label (`planHasBranding`).
 */

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface WhiteLabelRequest {
  id: string;
  eventId: string | null;
  brandColor: string | null;
  reason: string;
  status: RequestStatus;
  reviewNote: string | null;
  requester?: { fullName: string | null } | null;
  createdAt: string;
}

export interface WhiteLabelOverview {
  planHasBranding: boolean;
  space: {
    id: string;
    whiteLabelEnabled: boolean;
    brandColor: string | null;
    faviconUrl: string | null;
    emailFromName: string | null;
    emailReplyTo: string | null;
  };
  events: { id: string; title: string; status: string; whiteLabelEnabled: boolean; brandColor: string | null }[];
  /** Every request for this space, newest first. */
  requests: WhiteLabelRequest[];
}

export const getWhiteLabel = (spaceId: string) => call<WhiteLabelOverview>(`/white-label/spaces/${spaceId}`);

export const requestWhiteLabel = (input: { spaceId: string; eventId?: string; brandColor: string; reason: string }) =>
  call<WhiteLabelRequest>('/white-label/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

export interface BrandingPatch {
  brandColor?: string;
  /** Space-only extras; blank ones are omitted so they stay as they are. */
  faviconUrl?: string;
  emailFromName?: string;
  emailReplyTo?: string;
}

/** Change an approved space's colour (and email sender). */
export const updateSpaceBranding = (spaceId: string, patch: BrandingPatch) =>
  call<unknown>(`/white-label/spaces/${spaceId}/branding`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });

/** Change an approved event's colour. */
export const updateEventBranding = (eventId: string, brandColor: string) =>
  call<unknown>(`/white-label/events/${eventId}/branding`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brandColor }),
  });

/** Latest request for the space (eventId null) or one event; requests are newest first. */
export const latestRequestFor = (o: WhiteLabelOverview, eventId: string | null) =>
  o.requests.find((r) => (r.eventId ?? null) === eventId) ?? null;
