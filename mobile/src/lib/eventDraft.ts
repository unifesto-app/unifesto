import type { Event } from './api/events';
import type { EventDetailsPayload, EventType, EventVisibility, RegistrationType } from './api/eventAdmin';
import { buildRRule, defaultRecurrence, parseRRuleToState, type RecurrenceState } from './recurrence';

/**
 * The create/edit event form, held as plain strings and Dates so the inputs
 * can bind directly; turned into a payload only on save. Mirrors the web
 * wizard's rules so both apps accept and reject the same things.
 */
export interface EventDraft {
  title: string;
  slug: string;
  description: string;
  category: string;
  /** Comma-separated as typed. */
  tags: string;
  type: EventType;
  start: Date;
  end: Date;
  venueName: string;
  venueAddress: string;
  city: string;
  state: string;
  /** Pin from the web's place search; dropped once the address is retyped. */
  latitude: number | null;
  longitude: number | null;
  onlineUrl: string;
  onlinePlatform: string;
  registrationType: RegistrationType;
  visibility: EventVisibility;
  /** Create only: the first ticket or RSVP option. More can be added under Tickets. */
  ticketName: string;
  ticketPrice: string;
  ticketCapacity: string;
  /** Create (not a sub-event), or a series parent on edit. */
  recurrence: RecurrenceState;
}

export const isPaid = (d: Pick<EventDraft, 'registrationType'>) => d.registrationType !== 'RSVP';
export const showVenue = (d: Pick<EventDraft, 'type'>) => d.type !== 'ONLINE';
export const showOnline = (d: Pick<EventDraft, 'type'>) => d.type !== 'IN_PERSON';

/** Tomorrow 10:00 → 12:00 local, free RSVP, public. */
export function emptyEventDraft(): EventDraft {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10, 0, 0, 0);
  return {
    title: '',
    slug: '',
    description: '',
    category: '',
    tags: '',
    type: 'IN_PERSON',
    start,
    end: new Date(start.getTime() + 2 * 60 * 60 * 1000),
    venueName: '',
    venueAddress: '',
    city: '',
    state: '',
    latitude: null,
    longitude: null,
    onlineUrl: '',
    onlinePlatform: '',
    registrationType: 'RSVP',
    visibility: 'PUBLIC',
    ticketName: "I'll attend",
    ticketPrice: '',
    ticketCapacity: '',
    recurrence: defaultRecurrence(start.getDay()),
  };
}

export function toEventDraft(e: Event): EventDraft {
  return {
    ...emptyEventDraft(),
    title: e.title ?? '',
    slug: e.slug ?? '',
    description: e.description ?? '',
    category: e.category ?? '',
    tags: (e.tags ?? []).join(', '),
    type: e.type,
    start: new Date(e.startDateTime),
    end: new Date(e.endDateTime),
    venueName: e.venueName ?? '',
    venueAddress: e.venueAddress ?? '',
    city: e.city ?? '',
    state: e.state ?? '',
    latitude: e.latitude ?? null,
    longitude: e.longitude ?? null,
    onlineUrl: e.onlineUrl ?? '',
    onlinePlatform: e.onlinePlatform ?? '',
    registrationType: e.registrationType,
    visibility: e.visibility,
    recurrence: e.isRecurring
      ? parseRRuleToState(e.recurringRule, new Date(e.startDateTime).getDay())
      : defaultRecurrence(new Date(e.startDateTime).getDay()),
  };
}

/** Lowercase letters, digits and single hyphens, as the web slug field allows. */
export const sanitizeSlug = (raw: string) =>
  raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-').replace(/^-+/, '');

export function validateEventDraft(d: EventDraft, creating: boolean): string {
  if (d.title.trim().length < 3) return 'Give the event a name of at least 3 characters.';
  if (!creating && !d.slug.replace(/-+$/, '')) return 'The link name can’t be empty.';
  if (d.end <= d.start) return 'The end has to be after the start.';
  if (d.recurrence.enabled && !buildRRule(d.recurrence)) return 'Pick the last date the event repeats on.';
  if (showOnline(d) && d.onlineUrl.trim() && !/^https?:\/\/\S+\.\S+/i.test(d.onlineUrl.trim()))
    return "The joining link doesn't look like a web address.";
  if (creating) {
    if (!d.ticketName.trim()) return `Name the first ${isPaid(d) ? 'ticket' : 'RSVP option'}.`;
    if (isPaid(d)) {
      const p = Number(d.ticketPrice);
      if (!d.ticketPrice.trim() || Number.isNaN(p) || p < 0) return 'Enter a ticket price (0 or more).';
    }
    if (d.ticketCapacity.trim()) {
      const c = Number(d.ticketCapacity);
      if (!Number.isInteger(c) || c < 1) return 'Capacity must be a whole number of 1 or more.';
    }
  }
  return '';
}

const timezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
};

/**
 * On edit, venue coordinates are always sent (a number keeps the pin, null
 * clears one the retyped address no longer matches); on create they are left
 * out unless there is a pin.
 */
export function eventDraftToPayload(d: EventDraft, original?: Event, parentEventId?: string): EventDetailsPayload {
  // A series can't also be a sub-event; on edit only an existing series can change its rule.
  const rule = buildRRule(d.recurrence);
  const sendRule = rule && (original ? !!original.isRecurring : !parentEventId);
  const tags = d.tags.split(',').map((t) => t.trim()).filter(Boolean);
  const slug = d.slug.replace(/-+$/, '');
  return {
    title: d.title.trim(),
    ...(original && slug !== original.slug ? { slug } : {}),
    description: d.description.trim() || undefined,
    type: d.type,
    registrationType: d.registrationType,
    visibility: d.visibility,
    startDateTime: d.start.toISOString(),
    endDateTime: d.end.toISOString(),
    ...(original ? {} : { timezone: timezone(), isFree: !isPaid(d) }),
    category: d.category || undefined,
    ...(original ? { tags } : tags.length ? { tags } : {}),
    ...(showVenue(d)
      ? {
          venueName: d.venueName.trim() || undefined,
          venueAddress: d.venueAddress.trim() || undefined,
          city: d.city.trim() || undefined,
          state: d.state.trim() || undefined,
          ...(original || d.latitude != null ? { latitude: d.latitude, longitude: d.longitude } : {}),
        }
      : {}),
    ...(showOnline(d)
      ? { onlineUrl: d.onlineUrl.trim() || undefined, onlinePlatform: d.onlinePlatform.trim() || undefined }
      : {}),
    ...(sendRule ? { recurrenceRule: rule! } : {}),
    ...(!original && parentEventId ? { parentEventId } : {}),
  };
}
