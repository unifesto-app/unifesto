import { call } from './manageEvent';
import type { Event } from './events';

/*
 * Operator-side event lifecycle and details: create, edit, publish, cancel,
 * hide, delete, cover, WhatsApp group links and the payout account. Every
 * write is re-checked on the server (canManageEvent → event:edit, or a Space
 * Admin of the host or a co-host space).
 */

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

export type EventType = 'IN_PERSON' | 'ONLINE' | 'HYBRID';
export type EventVisibility = 'PUBLIC' | 'SPACE_ONLY' | 'PRIVATE';
/** Backend enum. TICKETED = paid tickets; RSVP = free sign-ups. */
export type RegistrationType = 'RSVP' | 'TICKETED' | 'MIXED';

/** The editable fields, as both create and PATCH take them. */
export interface EventDetailsPayload {
  title: string;
  slug?: string;
  description?: string;
  type: EventType;
  registrationType: RegistrationType;
  visibility: EventVisibility;
  startDateTime: string;
  endDateTime: string;
  timezone?: string;
  /** Up to MAX_EVENT_CATEGORIES, primary first; the backend derives `category`. */
  categories?: string[];
  tags?: string[];
  isFree?: boolean;
  venueName?: string;
  venueAddress?: string;
  city?: string;
  state?: string;
  /** null on PATCH clears a pin that no longer matches the typed address. */
  latitude?: number | null;
  longitude?: number | null;
  onlineUrl?: string;
  onlinePlatform?: string;
  /** RRULE for a series (create, or edit of a series parent). */
  recurrenceRule?: string;
  /** Create only: make it a sub-event of this big event. */
  parentEventId?: string;
}

/** GET /events/:id with the caller's token, so drafts and hidden events load too. */
export const getManagedEvent = (eventId: string) =>
  call<Event & { deletedAt?: string | null; cancelledAt?: string | null; cancellationReason?: string | null }>(
    `/events/${eventId}`,
  );

/** PATCH /events/:id */
export const updateEvent = (eventId: string, body: Partial<EventDetailsPayload> & { whatsappAttendeeGroupUrl?: string }) =>
  call<Event>(`/events/${eventId}`, json('PATCH', body));

// ── Lifecycle ────────────────────────────────────────────────────────────────

export const publishEvent = (eventId: string) => call<Event>(`/events/${eventId}/publish`, json('PATCH'));

/** Attendees are notified; refunds are handled separately. */
export const cancelEvent = (eventId: string, reason?: string) =>
  call<Event>(`/events/${eventId}/cancel`, json('PATCH', { reason }));

/** Reversible: only completed or cancelled events. */
export const hideEvent = (eventId: string) => call<Event>(`/events/${eventId}/hide`, json('DELETE'));

export const restoreEvent = (eventId: string) => call<Event>(`/events/${eventId}/restore`, json('PATCH'));

/** Irreversible: drafts and cancelled events only, never completed ones. */
export const deleteEvent = (eventId: string) => call<{ message: string }>(`/events/${eventId}`, json('DELETE'));

// ── WhatsApp attendee groups ─────────────────────────────────────────────────

export interface EventWhatsappConfig {
  whatsappAttendeeGroupUrl: string | null;
  /** A sub-event with no group of its own falls back to this (read-only). */
  parentAttendeeGroupUrl: string | null;
  ticketTypes: { id: string; name: string; whatsappGroupUrl: string | null }[];
}

/** GET /events/:id/whatsapp — manage-only; never on the public payload. */
export const getWhatsappConfig = (eventId: string) => call<EventWhatsappConfig>(`/events/${eventId}/whatsapp`);

/** PATCH one ticket type's group link. An empty string clears it; other fields are untouched. */
export const setTicketWhatsappLink = (eventId: string, ticketTypeId: string, url: string) =>
  call<unknown>(`/events/${eventId}/ticket-types/${ticketTypeId}`, json('PATCH', { whatsappGroupUrl: url }));

// ── Payout account ───────────────────────────────────────────────────────────

/** PATCH /payouts/event/:id/payout-account — null goes back to the creator's primary. */
export const setEventPayoutAccount = (eventId: string, bankAccountId: string | null) =>
  call<unknown>(`/payouts/event/${eventId}/payout-account`, json('PATCH', { bankAccountId }));

// ── Categories ───────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export const getCategories = () => call<Category[]>('/categories');
