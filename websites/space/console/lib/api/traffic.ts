import { call } from './call';

/*
 * Traffic: page views of event/space pages and tracked short links
 * (unifesto.app/l/<code>). Event endpoints are gated server-side by
 * event:view / event:edit, space ones by space:view / space:manage-settings,
 * admin ones by platform:manage. Page views are sent by services/pageViews.
 */

/** Whose links / numbers: one event, one space (its page + its events), or the platform. */
export type TrafficScope = { kind: 'event'; id: string } | { kind: 'space'; id: string } | { kind: 'admin' };

const base = (s: TrafficScope) =>
  s.kind === 'event' ? `/events/${s.id}` : s.kind === 'space' ? `/spaces/${s.id}` : '/admin';

// ── Views ────────────────────────────────────────────────────────────────────

export interface TrafficStats {
  days: number;
  views: number;
  /** Distinct app installs. */
  visitors: number;
  /** Confirmed registrations in the same window. */
  registrations: number;
  /** One row per IST day, oldest first, zeros included. */
  daily: { date: string; views: number; visitors: number }[];
  platforms: { platform: string; views: number }[];
  sources: { source: string | null; medium: string | null; views: number }[];
}

export interface TopItem {
  id: string;
  title?: string;
  name?: string;
  slug: string;
  views: number;
  visitors: number;
}

export interface SpaceTrafficStats extends TrafficStats {
  /** Views of the space page itself (the rest are its events). */
  spacePageViews: number;
  topEvents: TopItem[];
}

export interface PlatformTrafficStats extends TrafficStats {
  topEvents: TopItem[];
  topSpaces: TopItem[];
}

/** GET /events/:id/traffic, /spaces/:id/traffic or /admin/traffic */
export const getTraffic = <T extends TrafficStats = TrafficStats>(scope: TrafficScope, days = 30) =>
  call<T>(`${base(scope)}/traffic?days=${days}`);

// ── Short links ──────────────────────────────────────────────────────────────

export interface ShortLink {
  id: string;
  code: string;
  /** https://unifesto.app/l/<code> — what gets shared. */
  shortUrl: string;
  /** QR of shortUrl: SVG, or PNG with `?format=png`. */
  qrUrl: string;
  /** Destination, utm tags included. */
  url: string;
  title: string | null;
  source: string;
  target: 'EVENT' | 'SPACE' | 'URL';
  event: { id: string; title: string; slug: string } | null;
  space: { id: string; name: string; slug: string } | null;
  clicks: number;
  registrations: number;
  createdAt: string;
}

export interface ShortLinkStats extends ShortLink {
  /** Distinct visitors (by network + browser). */
  visitors: number;
  days: number;
  daily: { date: string; clicks: number }[];
  referrers: { domain: string | null; clicks: number }[];
  devices: { device: string; clicks: number }[];
  /** ISO country code ("IN"); null when unknown. */
  countries: { country: string | null; clicks: number }[];
}

export interface NewShortLink {
  title?: string;
  /** utm_source on the destination, e.g. "instagram". */
  source?: string;
  /** Space scope: link to one of its events instead of the space page. */
  eventId?: string;
  /** Admin scope: any https page on unifesto.app. */
  url?: string;
  /** Admin scope: a space page. */
  spaceId?: string;
}

export const getShortLinks = (scope: TrafficScope) => call<ShortLink[]>(`${base(scope)}/short-links`);

export const createShortLink = (scope: TrafficScope, body: NewShortLink) =>
  call<ShortLink>(`${base(scope)}/short-links`, { method: 'POST', body: JSON.stringify(body) });

export const getShortLinkStats = (scope: TrafficScope, linkId: string, days = 30) =>
  call<ShortLinkStats>(`${base(scope)}/short-links/${linkId}?days=${days}`);

export const revokeShortLink = (scope: TrafficScope, linkId: string) =>
  call<{ success: boolean }>(`${base(scope)}/short-links/${linkId}`, { method: 'DELETE' });

/** Route params <-> scope, for the shared short-link screens. */
export const scopeParams = (s: TrafficScope) => ({ scope: s.kind, scopeId: s.kind === 'admin' ? '' : s.id });

export function scopeFromParams(p: { scope?: string; scopeId?: string }): TrafficScope | null {
  if (p.scope === 'admin') return { kind: 'admin' };
  if ((p.scope === 'event' || p.scope === 'space') && p.scopeId) return { kind: p.scope, id: p.scopeId };
  return null;
}

/** "12%" — registrations per visitor; "–" when there were no visitors. */
export const conversion = (registrations: number, visitors: number) =>
  visitors > 0 ? `${Math.round((registrations / visitors) * 100)}%` : '–';
