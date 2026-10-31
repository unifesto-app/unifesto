import { call } from './manageEvent';

/*
 * Traffic: page views of event/space pages. Event endpoints are gated
 * server-side by event:view, space ones by space:view, admin ones by
 * platform:manage. Page views are sent by services/pageViews.
 */

/** Whose numbers: one event, one space (its page + its events), or the platform. */
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

/** "12%" — registrations per visitor; "–" when there were no visitors. */
export const conversion = (registrations: number, visitors: number) =>
  visitors > 0 ? `${Math.round((registrations / visitors) * 100)}%` : '–';
