import { call } from './call';

/*
 * Tracking: where an event's attendees came from (utm tags on the
 * link that brought them in). Gated server-side by event:view / space:view.
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

/** "Instagram", "Direct", "Shared from the app". */
export function sourceLabel(s: { source: string | null; medium: string | null }): string {
  if (!s.source) return 'Direct';
  if (s.source === 'unifesto_app') return 'Shared from the app';
  return s.source.charAt(0).toUpperCase() + s.source.slice(1);
}
