/**
 * Helpers shared by the check-in screens (event list, hub, scanner, manual).
 */

export type CheckinPhase = 'live' | 'upcoming' | 'ended';

/** Doors open this long before the event starts: crew arrive early to set up. */
const DOORS_OPEN_MS = 2 * 60 * 60 * 1000;

/**
 * Which bucket an event sits in on the check-in list, and whether the hub
 * shows it as "Live now".
 *
 * Door staff open the app before the event starts, so "live" is really
 * "doors are open" — not "the event has started".
 */
export function checkinPhase(
  e: { startDateTime: string; endDateTime: string },
  now: Date = new Date(),
): CheckinPhase {
  const start = new Date(e.startDateTime).getTime();
  const end = new Date(e.endDateTime).getTime();
  const t = now.getTime();

  if (t > end) return 'ended';
  if (t >= start - DOORS_OPEN_MS) return 'live';
  return 'upcoming';
}

/** "Just now", "4 min ago", "2 h ago", "Yesterday", "3 days ago". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const mins = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}

/** First letters of the first two words, for avatar placeholders. */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export const attendeeName = (a: { fullName: string | null; username: string | null } | null | undefined) =>
  a?.fullName || a?.username || 'Attendee';
