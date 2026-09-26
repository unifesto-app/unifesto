/**
 * "Add to calendar" link builders (event-calendar P1, mobile).
 *
 * Pure functions mirroring the web `lib/calendar.ts`. Mobile P1 opens these via
 * `Linking.openURL` only — no `expo-calendar`, so no native rebuild is needed.
 * The `.ics` link points at the backend (timezone-authoritative) and iOS/Android
 * hand a `text/calendar` response to the system calendar app.
 */
import { API_URL } from './constants';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://unifesto.app';

export interface CalendarEvent {
  slug: string;
  title: string;
  /** ISO 8601 start/end (UTC, as the API sends them). */
  startIso: string;
  endIso?: string | null;
  description?: string | null;
  location?: string | null;
}

/** Compact UTC stamp "YYYYMMDDTHHMMSSZ" that Google Calendar expects. */
function toGoogleStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** End fallback: a 2-hour block when the event has no explicit end. */
function resolveEnd(startIso: string, endIso?: string | null): string {
  if (endIso) return endIso;
  return new Date(new Date(startIso).getTime() + 2 * 60 * 60 * 1000).toISOString();
}

function eventPageUrl(slug: string): string {
  return `${WEB_URL}/event/${slug}`;
}

function buildDetails(event: CalendarEvent): string {
  const parts: string[] = [];
  if (event.description?.trim()) parts.push(event.description.trim());
  parts.push(`Event details: ${eventPageUrl(event.slug)}`);
  return parts.join('\n\n');
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const start = toGoogleStamp(event.startIso);
  const end = toGoogleStamp(resolveEnd(event.startIso, event.endIso));
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${end}`,
    details: buildDetails(event),
  });
  if (event.location?.trim()) params.set('location', event.location.trim());
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: new Date(event.startIso).toISOString(),
    enddt: new Date(resolveEnd(event.startIso, event.endIso)).toISOString(),
    body: buildDetails(event),
  });
  if (event.location?.trim()) params.set('location', event.location.trim());
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/** Backend `.ics` download (opens in the system calendar app). */
export function icsDownloadUrl(slug: string): string {
  return `${API_URL}/events/${slug}/calendar.ics`;
}
