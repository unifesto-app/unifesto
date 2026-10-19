/** Events with no end time count as over this long after they start. */
const DEFAULT_LENGTH_MS = 3 * 60 * 60 * 1000;

/**
 * Whether a ticket's event is over: past its end time, or marked completed or
 * cancelled by the organiser (which can happen before the scheduled end).
 * `event.status` is the event's own status, as the registrations list sends it.
 * The one rule for "ended" across Tickets, Home, the ticket page and the hubs.
 */
export function isEventOver(event: any, now = Date.now()): boolean {
  const status = event?.eventStatus ?? event?.status;
  if (status === 'COMPLETED' || status === 'CANCELLED') return true;
  if (!event?.startDateTime) return false;
  const start = new Date(event.startDateTime).getTime();
  const end = event.endDateTime ? new Date(event.endDateTime).getTime() : start + DEFAULT_LENGTH_MS;
  return (Number.isNaN(end) ? start + DEFAULT_LENGTH_MS : end) <= now;
}
