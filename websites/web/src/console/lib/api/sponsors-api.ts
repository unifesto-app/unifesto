/**
 * Sponsors API — over the NestJS `/spaces/:spaceId/sponsors/*` routes, gated by
 * `space:manage-sponsors` (Space Admin + Curator). Covers the reusable sponsor
 * roster, the per-space tier ladder, attaching sponsors to events with per-event
 * overrides, and the curator lead inbox.
 *
 * Every call takes `spaceId` explicitly; pages read it from `useSpaceId()`.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export interface SponsorTier {
  id: string;
  spaceId: string;
  name: string;
  rank: number;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Sponsor {
  id: string;
  spaceId: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  description: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { eventSponsors: number; sponsorUsers: number };
}

export interface EventSponsor {
  id: string;
  eventId: string;
  sponsorId: string;
  tierId: string | null;
  order: number;
  leadCaptureEnabled: boolean;
  overrideLogoUrl: string | null;
  overrideDescription: string | null;
  sponsor: Sponsor;
  tier: SponsorTier | null;
  _count?: { leads: number };
}

export type SponsorLeadSource = "OPT_IN" | "BOOTH_SCAN" | "MANUAL" | "IMPORT";

/** A lead in the per-event inbox (see backend listEventLeads). */
export interface EventLead {
  id: string;
  eventSponsorId: string;
  sponsorId: string;
  sponsorName: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: SponsorLeadSource;
  note: string | null;
  createdAt: string;
}

export interface CreateSponsorPayload {
  name: string;
  logoUrl?: string;
  websiteUrl?: string;
  description?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export interface CreateTierPayload {
  name: string;
  rank?: number;
  color?: string;
}

export interface AttachSponsorPayload {
  sponsorId: string;
  tierId?: string;
  order?: number;
  leadCaptureEnabled?: boolean;
  overrideLogoUrl?: string;
  overrideDescription?: string;
}

export interface UpdateEventSponsorPayload {
  tierId?: string | null;
  order?: number;
  leadCaptureEnabled?: boolean;
  overrideLogoUrl?: string | null;
  overrideDescription?: string | null;
}

const base = (spaceId: string) => `/spaces/${spaceId}/sponsors`;
type Result<T> = Promise<{ data: T | null; error: ApiError | null }>;

// ---- Tiers ----------------------------------------------------------------

export function listTiers(spaceId: string): Result<SponsorTier[]> {
  return apiCall<SponsorTier[]>(backendClient.get(`${base(spaceId)}/tiers`));
}

export function createTier(spaceId: string, payload: CreateTierPayload): Result<SponsorTier> {
  return apiCall<SponsorTier>(backendClient.post(`${base(spaceId)}/tiers`, payload));
}

export function updateTier(
  spaceId: string,
  id: string,
  payload: Partial<CreateTierPayload>
): Result<SponsorTier> {
  return apiCall<SponsorTier>(backendClient.patch(`${base(spaceId)}/tiers/${id}`, payload));
}

export function deleteTier(spaceId: string, id: string): Result<{ deleted: boolean }> {
  return apiCall(backendClient.delete(`${base(spaceId)}/tiers/${id}`));
}

// ---- Roster sponsors ------------------------------------------------------

export function listSponsors(spaceId: string): Result<Sponsor[]> {
  return apiCall<Sponsor[]>(backendClient.get(base(spaceId)));
}

export function createSponsor(spaceId: string, payload: CreateSponsorPayload): Result<Sponsor> {
  return apiCall<Sponsor>(backendClient.post(base(spaceId), payload));
}

export function updateSponsor(
  spaceId: string,
  id: string,
  payload: Partial<CreateSponsorPayload>
): Result<Sponsor> {
  return apiCall<Sponsor>(backendClient.patch(`${base(spaceId)}/${id}`, payload));
}

export function deleteSponsor(spaceId: string, id: string): Result<{ deleted: boolean }> {
  return apiCall(backendClient.delete(`${base(spaceId)}/${id}`));
}

// ---- Event attachments ----------------------------------------------------

export function listEventSponsors(spaceId: string, eventId: string): Result<EventSponsor[]> {
  return apiCall<EventSponsor[]>(backendClient.get(`${base(spaceId)}/events/${eventId}`));
}

export function attachSponsor(
  spaceId: string,
  eventId: string,
  payload: AttachSponsorPayload
): Result<EventSponsor> {
  return apiCall<EventSponsor>(
    backendClient.post(`${base(spaceId)}/events/${eventId}`, payload)
  );
}

export function updateEventSponsor(
  spaceId: string,
  eventId: string,
  eventSponsorId: string,
  payload: UpdateEventSponsorPayload
): Result<EventSponsor> {
  return apiCall<EventSponsor>(
    backendClient.patch(`${base(spaceId)}/events/${eventId}/${eventSponsorId}`, payload)
  );
}

export function detachSponsor(
  spaceId: string,
  eventId: string,
  eventSponsorId: string
): Result<{ detached: boolean }> {
  return apiCall(
    backendClient.delete(`${base(spaceId)}/events/${eventId}/${eventSponsorId}`)
  );
}

// ---- Sponsor portal access (invites) --------------------------------------

export type SponsorUserStatus = "INVITED" | "ACTIVE" | "REVOKED";

export interface SponsorUser {
  id: string;
  status: SponsorUserStatus;
  invitedEmail: string | null;
  createdAt: string;
  acceptedAt: string | null;
  user: {
    id: string;
    fullName: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
}

export function listSponsorUsers(spaceId: string, sponsorId: string): Result<SponsorUser[]> {
  return apiCall<SponsorUser[]>(backendClient.get(`${base(spaceId)}/${sponsorId}/users`));
}

export function inviteSponsorUser(
  spaceId: string,
  sponsorId: string,
  email: string
): Result<SponsorUser> {
  return apiCall<SponsorUser>(
    backendClient.post(`${base(spaceId)}/${sponsorId}/users`, { email })
  );
}

export function revokeSponsorUser(
  spaceId: string,
  sponsorId: string,
  sponsorUserId: string
): Result<{ revoked: boolean }> {
  return apiCall(backendClient.delete(`${base(spaceId)}/${sponsorId}/users/${sponsorUserId}`));
}

// ---- Lead inbox -----------------------------------------------------------

export function listEventLeads(
  spaceId: string,
  eventId: string,
  eventSponsorId?: string
): Result<EventLead[]> {
  return apiCall<EventLead[]>(
    backendClient.get(`${base(spaceId)}/events/${eventId}/leads`, {
      params: eventSponsorId ? { eventSponsorId } : undefined,
    })
  );
}
