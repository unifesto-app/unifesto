/**
 * Validation + normalization for organiser-supplied WhatsApp group links.
 *
 * The feature: an organiser creates a WhatsApp group for an event inside the
 * WhatsApp app, then pastes its invite link into the event (or a ticket type).
 * We store it privately and send it only to confirmed attendees. Because this
 * string comes straight from a human pasting from their phone, it arrives
 * messy: trailing spaces, an "https://" they may or may not have included,
 * tracking junk, or an entirely wrong URL.
 *
 * Every invite link is `https://chat.whatsapp.com/<INVITE_CODE>`, where the code
 * is ~22 chars of [A-Za-z0-9].
 *
 * A malformed or non-WhatsApp link must be rejected loudly so an organiser never
 * sends a dead "Join" link to attendees.
 */

export interface WhatsAppLinkResult {
  /** true when `value` is a usable, canonical invite link. */
  ok: boolean;
  /** Canonical `https://chat.whatsapp.com/<code>` form, when ok. */
  normalized?: string;
  /** Human-readable reason when !ok, safe to show the organiser. */
  error?: string;
}

/** Canonical host for every WhatsApp invite link. */
const WHATSAPP_INVITE_HOST = 'chat.whatsapp.com';

/**
 * Emitted with `{ eventId }` when an organiser saves a new group link on an
 * event or ticket type, so confirmed attendees who don't have it yet get it.
 */
export const WHATSAPP_LINK_SET = 'event.whatsapp-link-set';

/**
 * Validate and normalize a pasted WhatsApp group invite link.
 *
 * @param raw   The raw string an organiser pasted (may be empty/undefined —
 *              clearing the field is allowed and should return ok with no
 *              `normalized` value, i.e. "no link").
 *
 * Empty input means "no link" (so a saved link can be cleared). A missing
 * scheme is tolerated, the host must be exactly WHATSAPP_INVITE_HOST, the
 * invite code must look sane, and query strings / fragments are dropped. On
 * success `normalized` is the canonical `https://chat.whatsapp.com/<code>`.
 */
export function validateWhatsAppInviteLink(raw: string | null | undefined): WhatsAppLinkResult {
  // Empty / whitespace-only means "no link set" — clearing the field is valid.
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') {
    return { ok: true };
  }

  // Tolerate a pasted link with no scheme ("chat.whatsapp.com/AbC...").
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: 'That is not a valid WhatsApp group link.' };
  }

  // Host must be exactly chat.whatsapp.com — reject wa.me number links,
  // forms, or any other URL so a dead "Join" link never reaches attendees.
  if (url.hostname.toLowerCase() !== WHATSAPP_INVITE_HOST) {
    return {
      ok: false,
      error: `A WhatsApp group link must look like https://${WHATSAPP_INVITE_HOST}/…`,
    };
  }

  // The invite code is the first path segment. Strip any query/fragment junk
  // by taking only the path. Middle-strict: alphanumeric, length >= 10 — long
  // enough to catch a typo/partial paste, loose enough to survive WhatsApp
  // tweaking their code length.
  const code = url.pathname.replace(/^\/+/, '').split('/')[0];
  if (!/^[A-Za-z0-9]{10,}$/.test(code)) {
    return {
      ok: false,
      error: 'That WhatsApp group link is missing a valid invite code.',
    };
  }

  return { ok: true, normalized: `https://${WHATSAPP_INVITE_HOST}/${code}` };
}

/**
 * The stored links that can supply an attendee's WhatsApp invite.
 *
 * All of these are PRIVATE, attendee-only fields — never returned on an
 * unauthenticated path.
 */
export interface RegistrationWhatsAppSources {
  /** This registration's ticket-type group link (highest precedence). */
  ticketTypeGroupUrl?: string | null;
  /** The event's private attendee invite group. */
  eventAttendeeGroupUrl?: string | null;
  /** The parent big event's attendee group (fallback for a sub-event). */
  parentAttendeeGroupUrl?: string | null;
}

/**
 * The one WhatsApp group link an attendee should get, in precedence order:
 * their ticket type's group → the event's attendee group → the parent big
 * event's attendee group. Null when none is set.
 */
export function resolveRegistrationWhatsAppInvite(
  sources: RegistrationWhatsAppSources,
): string | null {
  return (
    sources.ticketTypeGroupUrl ||
    sources.eventAttendeeGroupUrl ||
    sources.parentAttendeeGroupUrl ||
    null
  );
}
