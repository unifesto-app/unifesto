import type { UpcomingTicket } from '../hooks/useHomeData';

/**
 * Shared model for the "Up next" home-screen widget (iOS + Android).
 *
 * The app is the only thing that talks to the API: the Home tab hands its
 * upcoming tickets to `syncUpNextWidget`, which stores a slim snapshot and
 * pushes render-ready props to each platform's widget. The widgets themselves
 * never fetch, so they keep working offline and after sign-out is wiped.
 */

/** Storage key for the ticket snapshots the widget (and a widget tap) reads. */
export const UP_NEXT_STORAGE_KEY = 'widget.upNext.v1';

export const UP_NEXT_WIDGET_NAME = 'UpNext';

/** What the widget needs to draw one ticket. Plain JSON: it crosses into native. */
export type UpNextTicket = {
  id: string;
  title: string;
  venue: string;
  /** Epoch ms. */
  startsAt: number;
  /** Epoch ms; falls back to start + DEFAULT_EVENT_LENGTH_MS when the event has no end. */
  endsAt: number;
};

/** Everything persisted for the widget: slim ticket rows + full snapshots for the ticket screen. */
export type UpNextSnapshot = {
  signedIn: boolean;
  tickets: UpNextTicket[];
  /** Full ticket objects by id, so a widget tap can open the ticket screen without a network call. */
  full: Record<string, UpcomingTicket>;
  savedAt: number;
};

/**
 * Props for one rendered frame of the widget. Flat and serialisable: iOS
 * stores them in its timeline, Android re-renders from them in a headless task.
 */
export type UpNextWidgetProps =
  | { state: 'signedOut' }
  | { state: 'empty' }
  | {
      state: 'ticket';
      title: string;
      venue: string;
      startsAt: number;
      isLive: boolean;
      moreCount: number;
      url: string;
    };

export const DEFAULT_EVENT_LENGTH_MS = 3 * 60 * 60 * 1000;

export function ticketDeepLink(id: string) {
  return `unifesto://ticket/${encodeURIComponent(id)}?source=widget`;
}

export function toUpNextTicket(t: UpcomingTicket): UpNextTicket | null {
  if (!t?.id || !t.startDateTime) return null;
  const startsAt = new Date(t.startDateTime).getTime();
  if (Number.isNaN(startsAt)) return null;
  const end = t.endDateTime ? new Date(t.endDateTime).getTime() : NaN;
  return {
    id: String(t.id),
    title: t.title ?? 'Your event',
    venue: t.venueName || t.city || (t.type === 'ONLINE' ? 'Online' : 'Venue TBA'),
    startsAt,
    endsAt: Number.isNaN(end) || end <= startsAt ? startsAt + DEFAULT_EVENT_LENGTH_MS : end,
  };
}

/**
 * Which ticket the widget shows at a moment in time, and whether it's live.
 *
 * `tickets` is sorted by start time. Return `null` when there's nothing left
 * to show (the widget then renders its empty state).
 */
export function pickUpNext(
  tickets: UpNextTicket[],
  now: number,
): { ticket: UpNextTicket; isLive: boolean; moreCount: number } | null {
  // An event stays "Up next" until it ends: while it's on it shows as live.
  // (It used to drop off at its start, so on event day the widget went blank.)
  const current = tickets.filter((t) => t.endsAt > now);
  const live = current.find((t) => t.startsAt <= now);
  const next = live ?? current.find((t) => t.startsAt > now);
  if (!next) return null;
  return { ticket: next, isLive: !!live, moreCount: current.length - 1 };
}

export function propsAt(snapshot: Pick<UpNextSnapshot, 'signedIn' | 'tickets'>, now: number): UpNextWidgetProps {
  if (!snapshot.signedIn) return { state: 'signedOut' };
  const pick = pickUpNext(snapshot.tickets, now);
  if (!pick) return { state: 'empty' };
  return {
    state: 'ticket',
    title: pick.ticket.title,
    venue: pick.ticket.venue,
    startsAt: pick.ticket.startsAt,
    isLive: pick.isLive,
    moreCount: pick.moreCount,
    url: ticketDeepLink(pick.ticket.id),
  };
}

/**
 * The moments the widget's content changes on its own (a ticket going live,
 * a ticket dropping off). iOS pre-schedules a frame at each one so the widget
 * stays right while the app is closed; Android re-evaluates on each refresh.
 */
export function timelineMoments(tickets: UpNextTicket[], now: number): number[] {
  const moments = new Set<number>([now]);
  for (const t of tickets) {
    if (t.startsAt > now) moments.add(t.startsAt);
    if (t.endsAt > now) moments.add(t.endsAt);
  }
  // WidgetKit caps how many entries it honours; a handful covers the next few events.
  return [...moments].sort((a, b) => a - b).slice(0, 12);
}

// ── Countdown widget ─────────────────────────────────────────────────────────

export const COUNTDOWN_WIDGET_NAME = 'Countdown';

/** Props for one frame of the "Countdown" widget: big days-to-go for the next event. */
export type CountdownWidgetProps =
  | { state: 'signedOut' }
  | { state: 'empty' }
  | {
      state: 'ticket';
      title: string;
      startsAt: number;
      isLive: boolean;
      /** Calendar days from today to the event day (0 = today), in the phone's timezone. */
      daysLeft: number;
      url: string;
    };

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Calendar days between two moments, by local midnight (DST-safe). */
export function calendarDaysBetween(from: number, to: number): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000);
}

export function countdownPropsAt(snapshot: Pick<UpNextSnapshot, 'signedIn' | 'tickets'>, now: number): CountdownWidgetProps {
  if (!snapshot.signedIn) return { state: 'signedOut' };
  const pick = pickUpNext(snapshot.tickets, now);
  if (!pick) return { state: 'empty' };
  return {
    state: 'ticket',
    title: pick.ticket.title,
    startsAt: pick.ticket.startsAt,
    isLive: pick.isLive,
    daysLeft: Math.max(0, calendarDaysBetween(now, pick.ticket.startsAt)),
    url: ticketDeepLink(pick.ticket.id),
  };
}

/** Countdown frames: the Up next moments plus each coming local midnight, when the day count drops. */
export function countdownMoments(tickets: UpNextTicket[], now: number): number[] {
  const moments = new Set(timelineMoments(tickets, now));
  let midnight = startOfDay(now);
  for (let i = 0; i < 7; i++) {
    midnight = startOfDay(midnight + 36 * 3_600_000); // next local midnight, even across DST
    moments.add(midnight);
  }
  return [...moments].sort((a, b) => a - b).slice(0, 16);
}
