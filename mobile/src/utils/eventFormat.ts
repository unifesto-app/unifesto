import { getEventCardPrice } from '../lib/api/events';
import { isEventOver } from '../lib/eventEnded';

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (from: Date, to: Date) =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);

export const formatTime = (d: Date) =>
  d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();

/** Two-line calendar chip on posters: { day: '12', month: 'Oct' }. */
export function dateChip(iso: string) {
  const d = new Date(iso);
  return {
    day: String(d.getDate()),
    month: d.toLocaleDateString('en-IN', { month: 'short' }),
  };
}

/**
 * Human "when" for card metadata: "Today · 6:30 PM", "Tomorrow · 6:30 PM",
 * "Sat · 6:30 PM" inside a week, otherwise "12 Oct · 6:30 PM".
 */
export function relativeWhen(iso: string, now: Date = new Date()) {
  const d = new Date(iso);
  const diff = dayDiff(now, d);
  const time = formatTime(d);
  if (diff === 0) return `Today · ${time}`;
  if (diff === 1) return `Tomorrow · ${time}`;
  if (diff > 1 && diff < 7) return `${d.toLocaleDateString('en-IN', { weekday: 'short' })} · ${time}`;
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${time}`;
}

/**
 * Countdown badge on the "Up next" ticket card.
 *
 * Wording decides how urgent the card feels: hours when it's close enough to
 * act on (leave now / get ready), days otherwise.
 */
export function countdownLabel(iso: string, now: Date = new Date()) {
  const start = new Date(iso);
  const ms = start.getTime() - now.getTime();
  if (ms <= 0) return 'Happening now';
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return `Starts in ${Math.max(1, Math.round(ms / 60000))} min`;
  if (hours < 12) return `Starts in ${hours}h`;
  const days = dayDiff(now, start);
  if (days <= 0) return 'Tonight';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

/**
 * Card-sized price: "Starting from ₹199" → "From ₹199". Accepts the slim
 * `{ price, currency }` ticket shape too (sub-events), which is all the
 * underlying helper reads.
 */
export function shortPrice(event: { isFree?: boolean; ticketTypes?: { price: string; currency: string }[] }) {
  return getEventCardPrice(event as Parameters<typeof getEventCardPrice>[0]).price.replace(/^Starting from /, 'From ');
}

/** Below this many registrations a row shows its price alone: "3 going" puts people off. */
const MIN_GOING = 10;
/** Share of a capped event taken before it reads "Almost full". */
const ALMOST_FULL = 0.85;

/**
 * The crowd beside a row's price: "Full" or "Almost full" for a capped event
 * (hot, so it reads in amber), else "64 going" once enough have registered.
 */
export function crowdLabel(e: { registeredCount?: number | null; capacity?: number | null }) {
  const going = e.registeredCount ?? 0;
  if (e.capacity && going >= e.capacity * ALMOST_FULL) {
    return { text: going >= e.capacity ? 'Full' : 'Almost full', hot: true };
  }
  if (going >= MIN_GOING) return { text: `${going.toLocaleString('en-IN')} going`, hot: false };
  return null;
}

/**
 * This weekend, local time: Saturday 00:00 up to Monday 00:00. On a Sunday it
 * is the weekend already under way, so "this weekend" never jumps a week ahead.
 */
export function weekendWindow(now: Date = new Date()) {
  const start = startOfDay(now);
  const dow = start.getDay(); // 0 = Sunday … 6 = Saturday
  start.setDate(start.getDate() + (dow === 0 ? -1 : 6 - dow));
  const end = new Date(start);
  end.setDate(start.getDate() + 2);
  return { start, end };
}

/** "Thu 12 Nov". */
const dayName = (d: Date) =>
  `${d.toLocaleDateString('en-IN', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-IN', { month: 'short' })}`;

const hasDate = (e: { startDateTime?: string }) => !!e.startDateTime && !Number.isNaN(new Date(e.startDateTime).getTime());

/**
 * Home's "Happening near you": the first `max` events that aren't over (the
 * input order is the priority, so city events keep their places), then sorted
 * by start under a day label ("Happening now", "Today", "Tomorrow", "Thu 12 Nov").
 */
export function groupByDay<T extends { startDateTime: string }>(events: T[], max: number, now: Date = new Date()) {
  const next = events
    .filter((e) => hasDate(e) && !isEventOver(e, now.getTime()))
    .slice(0, max)
    .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());
  const groups: { label: string; events: T[] }[] = [];
  for (const e of next) {
    const d = new Date(e.startDateTime);
    const diff = dayDiff(now, d);
    const label = d <= now ? 'Happening now' : diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : dayName(d);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.events.push(e);
    else groups.push({ label, events: [e] });
  }
  return groups;
}

/**
 * The time line of a row under a day label: the start time, or for something
 * already on, when it ends ("Until 9:00 PM" today, else "Until Thu 12 Nov").
 */
export function rowTime(e: { startDateTime: string; endDateTime?: string | null }, now: Date = new Date()) {
  const start = new Date(e.startDateTime);
  if (start > now) return formatTime(start);
  if (!e.endDateTime) return `Started ${formatTime(start)}`;
  const end = new Date(e.endDateTime);
  return `Until ${dayDiff(now, end) === 0 ? formatTime(end) : dayName(end)}`;
}

export const spaceMembers = (s: { member_count?: number; _count?: { userRoles: number } }) =>
  s.member_count || s._count?.userRoles || 0;

export const spaceLogo = (s: { logoUrl?: string | null; logo_url?: string | null }) =>
  s.logoUrl || s.logo_url || null;

export const spaceBanner = (s: { bannerUrl?: string | null; banner_url?: string | null }) =>
  s.bannerUrl || s.banner_url || null;
