/**
 * ICS (RFC 5545) generation for a single event — P1 of the event-calendar feature.
 *
 * Pure and dependency-free: takes the fields `getEventBySlug` already loads and
 * returns a `text/calendar` string. Reused by the `.ics` download endpoint, the
 * confirmation-email attachment, and (later) the per-user feed. Keep it pure — no
 * Prisma, no I/O — so it stays trivially testable.
 */

/** The subset of event fields the ICS needs. Matches what getEventBySlug selects. */
export interface IcsEventInput {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  startDateTime: Date;
  endDateTime: Date;
  timezone: string; // IANA, e.g. "Asia/Kolkata"
  type: string; // 'IN_PERSON' | 'ONLINE' | 'HYBRID'
  venueName?: string | null;
  venueAddress?: string | null;
  city?: string | null;
  onlineUrl?: string | null;
  organiserName?: string | null; // space.name ?? creator.fullName
  /** The space's live custom web domain, if any; links point there instead. */
  customDomain?: string | null;
}

/** Absolute URL of the public event page — used in DESCRIPTION and as UID anchor. */
export function eventPageUrl(slug: string, customDomain?: string | null): string {
  const base = customDomain ? `https://${customDomain}` : (process.env.PUBLIC_WEB_URL ?? 'https://unifesto.app');
  return `${base}/event/${slug}`;
}

/**
 * Escape a TEXT value per RFC 5545 §3.3.11: backslash, semicolon, comma, and
 * newlines are the reserved characters. (Line folding is not applied here; our
 * lines are short enough in practice — revisit if DESCRIPTION grows long.)
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Format a Date as an ICS local-time value "YYYYMMDDTHHMMSS" in the given IANA
 * timezone, to be paired with a `;TZID=<timezone>` parameter on DTSTART/DTEND.
 * We format the wall-clock time in the event's own zone (not UTC) so a client
 * that respects TZID shows the right local time and reminders fire correctly.
 */
function formatLocal(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}${get('month')}${get('day')}T${get('hour')}${get('minute')}${get('second')}`;
}

/** UTC stamp "YYYYMMDDTHHMMSSZ" for DTSTAMP (creation time of the ICS object). */
function formatUtcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Fold a single content line to <=75 octets per RFC 5545 §3.1: continuation
 * lines start with CRLF + one space. We measure UTF-8 byte length (not string
 * length) and never split a multi-byte character across a fold. The first
 * segment gets the full 75 octets; continuations reserve one for the leading
 * space, so their content is capped at 74.
 */
function foldLine(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const segments: string[] = [];
  let segment = '';
  let segmentBytes = 0;
  let first = true;
  for (const ch of line) {
    const chBytes = Buffer.byteLength(ch, 'utf8');
    const limit = first ? 75 : 74;
    if (segmentBytes + chBytes > limit) {
      segments.push(segment);
      segment = ch;
      segmentBytes = chBytes;
      first = false;
    } else {
      segment += ch;
      segmentBytes += chBytes;
    }
  }
  segments.push(segment);
  return segments.join('\r\n ');
}

/**
 * Escape a property PARAMETER value (e.g. the CN of ORGANIZER). Parameters are
 * escaped differently from TEXT values: instead of backslash escapes, a value
 * containing a colon, semicolon, or comma must be DQUOTE-wrapped, and the value
 * itself may not contain a DQUOTE or a newline (RFC 5545 §3.2). We strip those
 * and always quote, which is safe for any input.
 */
function quoteParam(value: string): string {
  return `"${value.replace(/["\r\n]/g, ' ').trim()}"`;
}

/**
 * Build the VEVENT property lines for one event.
 *
 * UID is `${id}@unifesto.app` (stable, so a re-download updates the entry);
 * DTSTART/DTEND carry the event's TZID; LOCATION is the venue for in-person
 * and hybrid events and the join URL for online ones, with the other channel
 * surfaced in DESCRIPTION. Each entry is one unfolded property line.
 */
function buildVeventLines(event: IcsEventInput, now: Date): string[] {
  const lines: string[] = [];
  const tz = event.timezone;
  const pageUrl = eventPageUrl(event.slug, event.customDomain);
  const hasVenue = event.type === 'IN_PERSON' || event.type === 'HYBRID';

  // UID must be globally unique AND stable across regenerations, so a re-download
  // updates the existing calendar entry instead of creating a duplicate.
  lines.push(`UID:${event.id}@unifesto.app`);
  lines.push(`DTSTAMP:${formatUtcStamp(now)}`);
  lines.push(`DTSTART;TZID=${tz}:${formatLocal(event.startDateTime, tz)}`);
  lines.push(`DTEND;TZID=${tz}:${formatLocal(event.endDateTime, tz)}`);
  lines.push(`SUMMARY:${escapeText(event.title)}`);

  // LOCATION holds exactly one place. For IN_PERSON/HYBRID that's the physical
  // venue (so maps/navigation work); for ONLINE it's the join URL. The venue
  // falls back address -> name -> city so we emit the most specific value we have.
  const venue =
    event.venueAddress?.trim() ||
    event.venueName?.trim() ||
    event.city?.trim() ||
    '';
  const location = hasVenue ? venue : event.onlineUrl?.trim() || venue;
  if (location) {
    lines.push(`LOCATION:${escapeText(location)}`);
  }

  // DESCRIPTION carries the blurb, the "other" channel (so a HYBRID event's join
  // URL is never lost when the venue owns LOCATION), and always a link back.
  const descParts: string[] = [];
  if (event.description?.trim()) descParts.push(event.description.trim());
  if (event.type === 'HYBRID' && event.onlineUrl?.trim()) {
    descParts.push(`Join online: ${event.onlineUrl.trim()}`);
  }
  descParts.push(`Event details: ${pageUrl}`);
  lines.push(`DESCRIPTION:${escapeText(descParts.join('\n\n'))}`);

  lines.push(`URL:${escapeText(pageUrl)}`);

  // ORGANIZER is optional. Its CN is a PARAMETER (DQUOTE-quoted, not TEXT-escaped)
  // and the value needs a CAL-ADDRESS, so we anchor it to a no-reply mailbox.
  if (event.organiserName?.trim()) {
    lines.push(
      `ORGANIZER;CN=${quoteParam(event.organiserName)}:mailto:noreply@unifesto.app`,
    );
  }

  lines.push('STATUS:CONFIRMED');
  return lines;
}

/** Assemble the full VCALENDAR document (CRLF line endings, per spec). */
export function buildEventIcs(event: IcsEventInput, now: Date = new Date()): string {
  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Unifesto//Event Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    ...buildVeventLines(event, now),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  // Fold every line at assembly time (§3.1) so buildVeventLines can stay simple —
  // it emits one unfolded property per entry and the envelope handles the 75-octet cap.
  return body.map(foldLine).join('\r\n') + '\r\n';
}
