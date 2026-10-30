import { call } from './manageEvent';
import { uploadImage } from './upload';

/*
 * Operator side of Sponsors & lead generation, over `/spaces/:spaceId/sponsors/*`
 * (space:manage-sponsors). In practice only Space Admins pass: the Curator grant
 * is EVENT-scoped and can't satisfy this SPACE-scoped action. Reads work on any
 * plan; every write is refused (403) unless the space's plan includes sponsors.
 *
 * Mirrors websites/web/src/console/lib/api/sponsors-api.ts.
 */

export interface SponsorTier {
  id: string;
  spaceId: string;
  name: string;
  /** 0 = most prominent. */
  rank: number;
  color: string | null;
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
  _count?: { eventSponsors: number; sponsorUsers: number };
}

/** getSponsor also returns where the sponsor is attached. */
export interface SponsorDetail extends Sponsor {
  eventSponsors?: { id: string; event: { id: string; title: string; slug: string } }[];
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

export type SponsorLeadSource = 'OPT_IN' | 'BOOTH_SCAN' | 'MANUAL' | 'IMPORT';

export const SPONSOR_LEAD_SOURCE: Record<SponsorLeadSource, string> = {
  OPT_IN: 'Opted in',
  BOOTH_SCAN: 'Booth scan',
  MANUAL: 'Added by hand',
  IMPORT: 'Imported',
};

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

export interface SponsorInput {
  name: string;
  logoUrl?: string;
  websiteUrl?: string;
  description?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}

/** Update body: `null` clears an optional field. */
export type SponsorUpdate = { name?: string } & {
  [K in Exclude<keyof SponsorInput, 'name'>]?: SponsorInput[K] | null;
};

export interface TierInput {
  name: string;
  rank?: number;
  /** null clears it (the API's @IsHexColor rejects ""). */
  color?: string | null;
}

export type SponsorUserStatus = 'INVITED' | 'ACTIVE' | 'REVOKED';

export interface SponsorUser {
  id: string;
  status: SponsorUserStatus;
  invitedEmail: string | null;
  createdAt: string;
  acceptedAt: string | null;
  user: { id: string; fullName: string | null; username: string | null; avatarUrl: string | null };
}

const base = (spaceId: string) => `/spaces/${spaceId}/sponsors`;
const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

// ---- Tiers ----
export const getTiers = (spaceId: string) => call<SponsorTier[]>(`${base(spaceId)}/tiers`);
export const createTier = (spaceId: string, body: TierInput) => call<SponsorTier>(`${base(spaceId)}/tiers`, json('POST', body));
export const updateTier = (spaceId: string, id: string, body: Partial<TierInput>) =>
  call<SponsorTier>(`${base(spaceId)}/tiers/${id}`, json('PATCH', body));
export const deleteTier = (spaceId: string, id: string) => call<unknown>(`${base(spaceId)}/tiers/${id}`, json('DELETE'));

// ---- Roster ----
export const getSponsors = (spaceId: string) => call<Sponsor[]>(base(spaceId));
export const getSponsor = (spaceId: string, id: string) => call<SponsorDetail>(`${base(spaceId)}/${id}`);
export const createSponsor = (spaceId: string, body: SponsorUpdate) => call<Sponsor>(base(spaceId), json('POST', body));
export const updateSponsor = (spaceId: string, id: string, body: SponsorUpdate) =>
  call<Sponsor>(`${base(spaceId)}/${id}`, json('PATCH', body));
export const deleteSponsor = (spaceId: string, id: string) => call<unknown>(`${base(spaceId)}/${id}`, json('DELETE'));

/** Upload a picked logo; save the returned URL on the sponsor like any other field. */
export const uploadSponsorLogo = (spaceId: string, uri: string) => uploadImage<{ logoUrl: string }>(`${base(spaceId)}/logo`, 'logo', uri);

// ---- Portal access ----
export const getSponsorUsers = (spaceId: string, sponsorId: string) => call<SponsorUser[]>(`${base(spaceId)}/${sponsorId}/users`);
export const inviteSponsorUser = (spaceId: string, sponsorId: string, email: string) =>
  call<SponsorUser>(`${base(spaceId)}/${sponsorId}/users`, json('POST', { email }));
export const revokeSponsorUser = (spaceId: string, sponsorId: string, sponsorUserId: string) =>
  call<unknown>(`${base(spaceId)}/${sponsorId}/users/${sponsorUserId}`, json('DELETE'));

// ---- Event attachments ----
export const getEventSponsors = (spaceId: string, eventId: string) => call<EventSponsor[]>(`${base(spaceId)}/events/${eventId}`);
export const attachSponsor = (
  spaceId: string,
  eventId: string,
  body: { sponsorId: string; tierId?: string; leadCaptureEnabled?: boolean },
) => call<EventSponsor>(`${base(spaceId)}/events/${eventId}`, json('POST', body));
export const updateEventSponsor = (
  spaceId: string,
  eventId: string,
  eventSponsorId: string,
  body: { tierId?: string | null; order?: number; leadCaptureEnabled?: boolean; overrideDescription?: string | null },
) => call<EventSponsor>(`${base(spaceId)}/events/${eventId}/${eventSponsorId}`, json('PATCH', body));
export const detachSponsor = (spaceId: string, eventId: string, eventSponsorId: string) =>
  call<unknown>(`${base(spaceId)}/events/${eventId}/${eventSponsorId}`, json('DELETE'));

export const getEventLeads = (spaceId: string, eventId: string) => call<EventLead[]>(`${base(spaceId)}/events/${eventId}/leads`);

/** Two-letter stand-in when a sponsor has no logo. */
export const initials = (name: string) => name.trim().slice(0, 2).toUpperCase();

/** "acme.com" from "https://www.acme.com/". */
export const bareUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/** Tier colour or null; accepts "#abc" / "#aabbcc". */
export const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
