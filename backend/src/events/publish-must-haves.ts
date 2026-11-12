import type { EventType, RegistrationType } from '@prisma/client';

/** What publishing reads of an event (Q22). */
export interface PublishCheckEvent {
  type: EventType;
  registrationType: RegistrationType;
  coverImageUrl: string | null;
  venueName: string | null;
  venueAddress: string | null;
  onlineUrl: string | null;
  /** Outside registration link: registering happens on that site instead. */
  externalRegistrationUrl: string | null;
  /** Active ticket types (RSVP options included). */
  ticketCount: number;
  /** Listed (published) sub-events: a festival hub takes registrations on those, not on itself. */
  subEventCount: number;
}

const has = (v: string | null) => !!v?.trim();

/**
 * Q22 (decision E): an event can't go live without a cover, somewhere to be
 * (a venue in person, a joining link online, either for hybrid) and one way to
 * register (a ticket, an RSVP option or an outside registration link).
 * Everything else on the console checklist stays a tip. Returns the missing
 * parts in curator words, empty when it can publish.
 */
export function publishMustHaves(e: PublishCheckEvent): string[] {
  const venue = has(e.venueName) || has(e.venueAddress);
  const link = has(e.onlineUrl);
  const missing: string[] = [];
  if (!has(e.coverImageUrl)) missing.push('a cover image');
  if (e.type === 'IN_PERSON' && !venue) missing.push('a venue');
  else if (e.type === 'ONLINE' && !link) missing.push('a joining link');
  else if (e.type === 'HYBRID' && !venue && !link) missing.push('a venue or joining link');
  if (!e.ticketCount && !e.subEventCount && !has(e.externalRegistrationUrl)) missing.push(e.registrationType === 'RSVP' ? 'an RSVP option' : 'a ticket');
  return missing;
}

/** "Add a cover image, a venue and a ticket before publishing." Old app builds show it as is. */
export function publishBlockedMessage(missing: string[]): string {
  const list = missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}` : missing[0];
  return `Add ${list} before publishing.`;
}
