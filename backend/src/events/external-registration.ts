import { BadRequestException } from '@nestjs/common';
import { isIP } from 'node:net';
import { isBlockedAddress } from './event-draft';

/**
 * Outside registration: an event whose registration runs on another site
 * (Google Forms, Unstop, Devfolio, the organiser's own). Unifesto lists it and
 * Register opens the link; no tickets, registrations or money here.
 *
 * An event has either this link or active ticket types, never both, so no
 * registration path can sell a seat on an event that registers elsewhere.
 */

const MAX_LENGTH = 2000;

/**
 * DTO value → column value. Undefined leaves the column alone, blank clears
 * it, anything else must be a public https link. The web event page is cached
 * without a nonce, so only https reaches it (cached-pages.ts).
 */
export function resolveExternalRegistrationUrl(raw: string | null | undefined): string | null | undefined {
  if (raw === undefined) return undefined;
  const value = (raw ?? '').trim();
  if (!value) return null;
  if (value.length > MAX_LENGTH) throw new BadRequestException('That registration link is too long');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException('Enter the full registration link, starting with https://');
  }
  if (url.protocol !== 'https:') throw new BadRequestException('The registration link must start with https://');
  if (url.username || url.password) throw new BadRequestException('The registration link cannot contain a username or password');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host.includes('.') || host.endsWith('.localhost') || (isIP(host) && isBlockedAddress(host))) {
    throw new BadRequestException('The registration link must be a public website');
  }
  return url.toString();
}

/** Ticket edits on an event that registers elsewhere. */
export const OUTSIDE_LINK_TICKETS_MESSAGE =
  'This event registers on another site. Remove its outside registration link before turning tickets on.';

export const OUTSIDE_LINK_MESSAGE = "Registration for this event is on the organiser's site.";

/** Refuses a Unifesto registration on an event that registers elsewhere. */
export function assertNoOutsideLink(event: { externalRegistrationUrl?: string | null }): void {
  if (event.externalRegistrationUrl) throw new BadRequestException(OUTSIDE_LINK_MESSAGE);
}
