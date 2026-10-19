import { getMyRegisteredEvents } from './api/events';
import { getMyMemberTickets } from './api/registrations';
import type { UpcomingTicket } from '../hooks/useHomeData';

/** Events with no end time count as over this long after they start. */
const DEFAULT_LENGTH_MS = 3 * 60 * 60 * 1000;

/** How many of my latest registrations to scan for the next few tickets. */
const FETCH_WINDOW = 20;

/**
 * Whether a ticket's event is over: past its end time, or marked completed or
 * cancelled by the organiser (which can happen before the scheduled end).
 * `event.status` is the event's own status, as the registrations list sends it.
 */
export function isEventOver(event: any, now = Date.now()): boolean {
  const status = event?.eventStatus ?? event?.status;
  if (status === 'COMPLETED' || status === 'CANCELLED') return true;
  if (!event?.startDateTime) return false;
  const start = new Date(event.startDateTime).getTime();
  const end = event.endDateTime ? new Date(event.endDateTime).getTime() : start + DEFAULT_LENGTH_MS;
  return (Number.isNaN(end) ? start + DEFAULT_LENGTH_MS : end) <= now;
}

/**
 * The signed-in person's next tickets, soonest first: their own registrations
 * plus seats they claimed in someone else's group (those carry their own seat
 * QR), same as the Tickets tab. An event stays in the list until it ends, so
 * the Home card and the widgets still show it while it's on; one the organiser
 * marks completed or cancelled drops out straight away. Throws on network
 * failure (callers keep what they had).
 */
export async function fetchUpcomingTickets(limit = 5): Promise<UpcomingTicket[]> {
  const [response, memberRes] = await Promise.all([
    // Newest registrations come first, not soonest events, so look past the
    // first few: finished ones would otherwise crowd out what's next.
    getMyRegisteredEvents(1, Math.max(limit, FETCH_WINDOW)),
    getMyMemberTickets().catch(() => ({ data: [] })),
  ]);
  const own = response?.data || response?.events || [];
  const member = (memberRes?.data || []).map((r: any) => ({ ...r, isGroupMember: true }));
  const seen = new Set<string>();
  const registrations = [...own, ...member].filter((r: any) => {
    if (!r?.id || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
  const now = Date.now();
  return registrations
    .map((reg: any) =>
      reg.event
        ? {
            ...reg.event,
            qrCode: reg.qrCode,
            registrationId: reg.id,
            registrationStatus: reg.status,
            // A group pass reads its own check-ins, not the booking's status.
            groupSize: reg.groupSize,
            eventStatus: reg.event.status,
            ticketType: reg.ticketType,
            ticketCode: reg.tickets?.[0]?.ticketCode,
            ...(reg.isGroupMember ? { isGroupMember: true, leadName: reg.leadName ?? null } : {}),
          }
        : reg,
    )
    .filter((event: any) => !!event?.startDateTime && !isEventOver(event, now))
    .sort((a: any, b: any) => +new Date(a.startDateTime) - +new Date(b.startDateTime))
    .slice(0, limit);
}
