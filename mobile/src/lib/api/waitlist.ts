import { call } from './manageEvent';

/*
 * Organiser side of the per-ticket waiting list. Letting someone in holds a
 * seat for them; a paid ticket then waits for them to pay, with no automatic
 * expiry, so an organiser revokes an offer to free the seat.
 */

export type WaitlistStatus = 'WAITING' | 'OFFERED' | 'CONVERTED' | 'EXPIRED' | 'DECLINED';

export interface WaitlistEntry {
  registrationId: string;
  /** 1-based place in the queue. */
  position: number;
  user: { id: string; fullName: string | null; username: string | null; email: string | null; avatarUrl: string | null };
  ticketType: { id: string; name: string; price: number } | null;
  /** Seats this entry needs (a group of 5 needs 5). */
  seats: number;
  waitlistStatus: WaitlistStatus;
  joinedAt: string | null;
  offeredAt: string | null;
  /** Set only while OFFERED. */
  amountDue: number | null;
}

export interface WaitlistSummaryRow {
  ticketTypeId: string;
  name: string;
  isPaid: boolean;
  waitlistEnabled: boolean;
  /** null = unlimited. */
  seatsAvailable: number | null;
  waiting: number;
  offered: number;
  converted: number;
}

export const getWaitlistSummary = (eventId: string) => call<WaitlistSummaryRow[]>(`/events/${eventId}/waitlist/summary`);

/** Omit status for the active queue (waiting + offered). */
export function getWaitlist(eventId: string, opts: { ticketTypeId?: string; status?: WaitlistStatus; search?: string }) {
  const q = new URLSearchParams({ limit: '100' });
  if (opts.ticketTypeId) q.set('ticketTypeId', opts.ticketTypeId);
  if (opts.status) q.set('status', opts.status);
  if (opts.search?.trim()) q.set('search', opts.search.trim());
  return call<{ data: WaitlistEntry[] }>(`/events/${eventId}/waitlist?${q.toString()}`);
}

export const letIn = (eventId: string, registrationId: string) =>
  call<{ needsPayment: boolean; amountDue?: number; message: string }>(`/events/${eventId}/waitlist/${registrationId}/allow`, {
    method: 'POST',
  });

/** Frees the held seat; the offer can't be reinstated. */
export const revokeOffer = (eventId: string, registrationId: string) =>
  call<unknown>(`/events/${eventId}/waitlist/${registrationId}/revoke`, { method: 'POST' });

/** Let the next `count` in line in, as far as free seats allow. */
export const letInNext = (eventId: string, ticketTypeId: string, count: number) =>
  call<{ offeredCount: number; requested: number }>(`/events/${eventId}/waitlist/allow-next`, {
    method: 'POST',
    body: JSON.stringify({ ticketTypeId, count }),
  });
