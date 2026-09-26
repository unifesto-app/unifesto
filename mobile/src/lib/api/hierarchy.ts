import { call } from './manageEvent';

/*
 * Event hierarchy: a "big event" groups sub-events (nesting capped at depth
 * 3). Events of the same space attach instantly; an event another space owns
 * (one this space co-hosts) needs its owner to accept a request. Plus
 * recurring series: a series parent materialises occurrences, and an
 * occurrence can be detached to edit it on its own.
 */

export interface SubEventRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  startDateTime: string;
  coverImageUrl?: string | null;
  registeredCount: number;
  deletedAt?: string | null;
}

export interface AttachRequest {
  id: string;
  status: string;
  reason: string | null;
  parentEvent: { id: string; title: string; space: { name: string } };
  childEvent: { id: string; title: string; space: { name: string } };
  requester: { fullName: string | null; username: string | null };
}

/** Every sub-event, drafts included (manage view). */
export const getSubEvents = (parentId: string) => call<SubEventRow[]>(`/events/${parentId}/sub-events/manage`);

export const attachSubEvent = (parentId: string, eventId: string) =>
  call<unknown>(`/events/${parentId}/sub-events`, { method: 'POST', body: JSON.stringify({ eventId }) });

export const detachSubEvent = (parentId: string, childId: string) =>
  call<unknown>(`/events/${parentId}/sub-events/${childId}`, { method: 'DELETE' });

/** incoming: others asking to nest this event; outgoing: this parent asking to pull one in. */
export const getAttachRequests = (eventId: string) =>
  call<{ incoming: AttachRequest[]; outgoing: AttachRequest[] }>(`/events/${eventId}/sub-events/requests`);

export const requestAttach = (parentId: string, eventId: string, reason?: string) =>
  call<unknown>(`/events/${parentId}/sub-events/requests`, { method: 'POST', body: JSON.stringify({ eventId, reason }) });

export const acceptAttach = (eventId: string, requestId: string) =>
  call<unknown>(`/events/${eventId}/sub-events/requests/${requestId}/accept`, { method: 'POST', body: '{}' });

export const declineAttach = (eventId: string, requestId: string) =>
  call<unknown>(`/events/${eventId}/sub-events/requests/${requestId}/decline`, { method: 'POST', body: '{}' });

export const cancelAttach = (eventId: string, requestId: string) =>
  call<unknown>(`/events/${eventId}/sub-events/requests/${requestId}`, { method: 'DELETE' });

// ── Recurring series ─────────────────────────────────────────────────────────

export interface Occurrence {
  id: string;
  slug: string;
  title: string;
  startDateTime: string;
  status: string;
  registeredCount: number;
  seriesDetached?: boolean;
}

export const getOccurrences = (seriesId: string) =>
  call<{ recurrenceRule: string | null; generatedUntil: string | null; occurrences: Occurrence[] }>(`/events/${seriesId}/occurrences`);

/** Take one occurrence out of the series so edits to it stick. */
export const detachOccurrence = (occurrenceId: string) =>
  call<unknown>(`/events/${occurrenceId}/detach-from-series`, { method: 'POST' });
