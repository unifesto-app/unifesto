import { getEventCardPrice } from '../lib/api/events';

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

/** "Good morning" / "Good afternoon" / "Good evening" / "Up late". */
export function greeting(now: Date = new Date()) {
  const h = now.getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const spaceMembers = (s: { member_count?: number; _count?: { userRoles: number } }) =>
  s.member_count || s._count?.userRoles || 0;

export const spaceLogo = (s: { logoUrl?: string | null; logo_url?: string | null }) =>
  s.logoUrl || s.logo_url || null;

export const spaceBanner = (s: { bannerUrl?: string | null; banner_url?: string | null }) =>
  s.bannerUrl || s.banner_url || null;
