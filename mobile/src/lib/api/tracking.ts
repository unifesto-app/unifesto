import { call } from './manageEvent';

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

/** GET /partner-links/mine — every event this user is a partner on. */
export const getMyPartnerLinks = () => call<MyPartnerLink[]>('/partner-links/mine');

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

// ── Page analytics + short links (4.0.5) ─────────────────────────────────────

export interface PageSourceRow {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  /** Visitor-days that arrived with these tags. */
  visitors: number;
  views: number;
  registrations: number;
}

export interface ShortLink {
  id: string;
  code: string;
  target: 'EVENT' | 'SPACE';
  label: string;
  utmSource: string;
  utmMedium: string | null;
  utmCampaign: string | null;
  clicks: number;
  lastClickedAt: string | null;
  createdAt: string;
  event: { id: string; slug: string; title: string } | null;
  shortUrl: string;
  destinationUrl: string | null;
}

export interface PageAnalytics {
  range: { days: number; from: string; to: string };
  totals: {
    views: number;
    visitors: number;
    uniqueVisitors: number;
    registrations: number;
    /** Registrations per 100 visitor-days; null with no visitors. */
    conversionRate: number | null;
  };
  daily: { day: string; views: number; visitors: number; registrations: number }[];
  sources: PageSourceRow[];
  platforms: { platform: string; visitors: number }[];
  referrers: { referrer: string; visitors: number }[];
  shortLinks: ShortLink[];
}

export interface SpacePageAnalytics extends PageAnalytics {
  spacePage: { visitors: number; views: number };
  topEvents: {
    id: string;
    title: string;
    slug: string;
    startDateTime: string;
    visitors: number;
    views: number;
    registrations: number;
    conversionRate: number | null;
  }[];
}

/** GET /events/:id/page-analytics */
export const getEventPageAnalytics = (eventId: string, days = 30) =>
  call<PageAnalytics>(`/events/${eventId}/page-analytics?days=${days}`);

/** GET /spaces/:id/page-analytics — the space page plus all of its events. */
export const getSpacePageAnalytics = (spaceId: string, days = 30) =>
  call<SpacePageAnalytics>(`/spaces/${spaceId}/page-analytics?days=${days}`);

export interface NewShortLink {
  label: string;
  utmSource: string;
  utmMedium?: string;
  utmCampaign?: string;
}

export type ShortLinkScope = { eventId: string } | { spaceId: string };

const linksPath = (scope: ShortLinkScope) =>
  'eventId' in scope ? `/events/${scope.eventId}/short-links` : `/spaces/${scope.spaceId}/short-links`;

export const createShortLink = (scope: ShortLinkScope, link: NewShortLink) =>
  call<ShortLink>(linksPath(scope), { method: 'POST', body: JSON.stringify(link) });

export const deleteShortLink = (scope: ShortLinkScope, linkId: string) =>
  call<{ success: boolean }>(`${linksPath(scope)}/${linkId}`, { method: 'DELETE' });
