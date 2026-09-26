/**
 * "Add to calendar" link builders (event-calendar P1).
 *
 * Pure functions — no network, no React — so they can be reused on the event
 * detail page and the post-registration success page, and unit-tested in
 * isolation. Google/Outlook are deep links built entirely on the client; the
 * `.ics` option points at the backend endpoint, which is the timezone-authoritative
 * source (it emits a proper VTIMEZONE-anchored file).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.unifesto.app";

/** The minimal event shape the calendar links need. */
export interface CalendarEvent {
  slug: string;
  title: string;
  /** ISO 8601 start/end (UTC, as the API sends them). */
  startIso: string;
  endIso?: string;
  description?: string | null;
  location?: string | null;
}

/** Compact UTC stamp "YYYYMMDDTHHMMSSZ" that Google Calendar expects. */
function toGoogleStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * End time fallback: if an event has no explicit end, assume a 2-hour block so
 * the calendar entry isn't zero-length (which some clients render oddly).
 */
function resolveEnd(startIso: string, endIso?: string): string {
  if (endIso) return endIso;
  return new Date(new Date(startIso).getTime() + 2 * 60 * 60 * 1000).toISOString();
}

/** Absolute URL of the public event page, woven into the event description. */
function eventPageUrl(slug: string): string {
  const base = process.env.NEXT_PUBLIC_WEB_URL || "https://unifesto.app";
  return `${base}/event/${slug}`;
}

function buildDetails(event: CalendarEvent): string {
  const parts: string[] = [];
  if (event.description?.trim()) parts.push(event.description.trim());
  parts.push(`Event details: ${eventPageUrl(event.slug)}`);
  return parts.join("\n\n");
}

/** Google Calendar "add event" template link. */
export function googleCalendarUrl(event: CalendarEvent): string {
  const start = toGoogleStamp(event.startIso);
  const end = toGoogleStamp(resolveEnd(event.startIso, event.endIso));
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${start}/${end}`,
    details: buildDetails(event),
  });
  if (event.location?.trim()) params.set("location", event.location.trim());
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Outlook (web) "compose event" deep link. */
export function outlookCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    startdt: new Date(event.startIso).toISOString(),
    enddt: new Date(resolveEnd(event.startIso, event.endIso)).toISOString(),
    body: buildDetails(event),
  });
  if (event.location?.trim()) params.set("location", event.location.trim());
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/** Backend `.ics` download (the timezone-authoritative option). */
export function icsDownloadUrl(slug: string): string {
  return `${API_URL}/events/${slug}/calendar.ics`;
}
