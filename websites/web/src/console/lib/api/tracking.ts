import { call } from './call';

/*
 * Tracking: where an event's attendees came from (utm tags on the
 * link that brought them in) and partner tracking links. Curator endpoints are
 * gated server-side by event:view / event:edit; partner endpoints only ever
 * return the calling user's own partner links, as counts (no attendee data).
 */

// ── Curator ──────────────────────────────────────────────────────────────────

export interface RegistrationSource {
  /** null = untagged ("Direct"). */
  source: string | null;
  medium: string | null;
  campaign: string | null;
  registrations: number;
  revenue: number;
}

export interface RegistrationSources {
  total: number;
  tagged: number;
  sources: RegistrationSource[];
}

/** GET /events/:id/registration-sources */
export const getRegistrationSources = (eventId: string) =>
  call<RegistrationSources>(`/events/${eventId}/registration-sources`);

export interface PartnerLink {
  id: string;
  name: string;
  source: string;
  contact: { id: string; fullName: string | null; username: string | null; avatarUrl: string | null };
  registrations: number;
  trackingUrl: string;
  createdAt: string;
}

/** GET /events/:id/partner-links */
export const getPartnerLinks = (eventId: string) => call<PartnerLink[]>(`/events/${eventId}/partner-links`);

/** POST /events/:id/partner-links — `email` is the partner contact's Unifesto account. */
export const createPartnerLink = (eventId: string, name: string, email: string) =>
  call<PartnerLink>(`/events/${eventId}/partner-links`, {
    method: 'POST',
    body: JSON.stringify({ name, email }),
  });

/** DELETE /events/:id/partner-links/:linkId — hides the stats from the partner. */
export const revokePartnerLink = (eventId: string, linkId: string) =>
  call<{ success: boolean }>(`/events/${eventId}/partner-links/${linkId}`, { method: 'DELETE' });

// ── Partner ──────────────────────────────────────────────────────────────────

export interface PartnerEvent {
  id: string;
  slug: string;
  title: string;
  coverImageUrl: string | null;
  startDateTime: string;
  space: { name: string } | null;
}

export interface MyPartnerLink {
  id: string;
  name: string;
  event: PartnerEvent;
  registrations: number;
  trackingUrl: string;
}

export interface PartnerStats extends MyPartnerLink {
  /** Registrations credited today (IST). */
  today: number;
  /** Confirmed registrations per IST day, oldest first; days with none are omitted. */
  daily: { date: string; count: number }[];
}

/** GET /partner-links/:id/stats */
export const getPartnerStats = (linkId: string) => call<PartnerStats>(`/partner-links/${linkId}/stats`);

// ── Drill-downs ──────────────────────────────────────────────────────────────

export interface SourceAttendee {
  id: string;
  registeredAt: string;
  groupSize: number | null;
  quantity: number;
  ticketType: { name: string } | null;
  user: { id: string; fullName: string | null; username: string | null; avatarUrl: string | null };
}

/**
 * GET /events/:id/registration-sources/attendees — the registrations behind one
 * source row. Pass null for an untagged tag (the Direct row).
 */
export const getSourceAttendees = (
  eventId: string,
  tags: { source: string | null; medium: string | null; campaign: string | null },
) => {
  const q = new URLSearchParams({
    source: tags.source ?? '',
    medium: tags.medium ?? '',
    campaign: tags.campaign ?? '',
  });
  return call<SourceAttendee[]>(`/events/${eventId}/registration-sources/attendees?${q.toString()}`);
};

export interface SpaceRegistrationSource {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  registrations: number;
  events: { id: string; title: string; registrations: number }[];
}

/** GET /spaces/:spaceId/registration-sources — across every event in the space. */
export const getSpaceRegistrationSources = (spaceId: string) =>
  call<{ total: number; tagged: number; sources: SpaceRegistrationSource[] }>(
    `/spaces/${spaceId}/registration-sources`,
  );

/** "Instagram", "Oqens (partner)", "Direct", "Shared from the app". */
export function sourceLabel(s: { source: string | null; medium: string | null }): string {
  if (!s.source) return 'Direct';
  if (s.source === 'unifesto_app') return 'Shared from the app';
  const name = s.source.charAt(0).toUpperCase() + s.source.slice(1);
  return s.medium === 'partner' ? `${name} (partner)` : name;
}
