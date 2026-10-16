/**
 * Validation + normalization for organiser-supplied WhatsApp invite links.
 *
 * The feature: an organiser manually creates a WhatsApp *group* for an event
 * (or a *community* for a big/parent event) inside the WhatsApp app, then pastes
 * the invite link into the event editor. We store it and render a
 * "Join WhatsApp Group" button. Because this string comes straight from a human
 * pasting from their phone, it arrives messy — trailing spaces, an "https://"
 * they may or may not have included, tracking junk, or an entirely wrong URL.
 *
 * WhatsApp invite links come in two shapes we care about:
 *
 *   GROUP:      https://chat.whatsapp.com/<INVITE_CODE>
 *   COMMUNITY:  https://chat.whatsapp.com/<INVITE_CODE>   (same host)
 *
 * NOTE: WhatsApp does NOT expose distinct hostnames for group vs community
 * invite links — both are `chat.whatsapp.com/<code>`. So we cannot tell them
 * apart from the URL alone; the *context* (is this a parent/big event?) decides
 * which field it lands in. The invite code itself is ~22 chars of [A-Za-z0-9].
 *
 * A malformed or non-WhatsApp link must be rejected loudly so an organiser never
 * publishes a dead "Join" button to attendees.
 */

export type WhatsAppLinkKind = 'group' | 'community';

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
 * Validate and normalize a pasted WhatsApp group/community invite link.
 *
 * @param raw   The raw string an organiser pasted (may be empty/undefined —
 *              clearing the field is allowed and should return ok with no
 *              `normalized` value, i.e. "no link").
 * @param kind  Whether this field is a 'group' (sub/standalone event) or
 *              'community' (big/parent event) link — used only for the wording
 *              of error messages, since the URL shape is identical.
 *
 * Empty input means "no link" (so a saved link can be cleared). A missing
 * scheme is tolerated, the host must be exactly WHATSAPP_INVITE_HOST, the
 * invite code must look sane, and query strings / fragments are dropped. On
 * success `normalized` is the canonical `https://chat.whatsapp.com/<code>`.
 */
export function validateWhatsAppInviteLink(
  raw: string | null | undefined,
  kind: WhatsAppLinkKind,
): WhatsAppLinkResult {
  const label = kind === 'community' ? 'community' : 'group';

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
    return { ok: false, error: `That is not a valid WhatsApp ${label} link.` };
  }

  // Host must be exactly chat.whatsapp.com — reject wa.me number links,
  // forms, or any other URL so a dead "Join" button never reaches attendees.
  if (url.hostname.toLowerCase() !== WHATSAPP_INVITE_HOST) {
    return {
      ok: false,
      error: `A WhatsApp ${label} link must look like https://${WHATSAPP_INVITE_HOST}/…`,
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
      error: `That WhatsApp ${label} link is missing a valid invite code.`,
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

export interface ResolvedWhatsAppInvite {
  /** The single link to surface, or null when none is configured. */
  inviteUrl: string | null;
  /**
   * Retained for API/consumer back-compat. The attendee invite is always a
   * WhatsApp *group* now (the community concept was retired), so this is always
   * false — existing "group" vs "community" wording resolves to "group".
   */
  isCommunity: boolean;
}

/**
 * Resolve the one WhatsApp invite an attendee should get, in precedence order:
 * their ticket type's group → the event's attendee group → the parent big
 * event's attendee group. Always a group, so `isCommunity` is always false.
 */
export function resolveRegistrationWhatsAppInvite(
  sources: RegistrationWhatsAppSources,
): ResolvedWhatsAppInvite {
  const inviteUrl =
    sources.ticketTypeGroupUrl ||
    sources.eventAttendeeGroupUrl ||
    sources.parentAttendeeGroupUrl ||
    null;
  return { inviteUrl, isCommunity: false };
}
