import { UNIFESTO } from "@/lib/site";

// Upcoming events of WeGoBeyond's Unifesto space, for the "Register now" section.
// Same public endpoints the Unifesto space page uses:
//   GET /spaces/slug/:slug             -> { id, ... }
//   GET /events/space/:id?when=upcoming -> { data: [...raw events], total }

export type UpcomingEvent = {
  slug: string;
  title: string;
  start: string; // ISO date-time
  timezone: string;
  place?: string;
  /** "Free", a starting price in rupees, or null when there are no tickets yet. */
  price: "Free" | number | null;
};

// Cached on the server and refreshed every ten minutes, so the page never waits on
// Unifesto per visit and new events show up shortly after they're published.
const REVALIDATE_SECONDS = 600;

async function getJson(path: string) {
  const res = await fetch(`${UNIFESTO.api}${path}`, {
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Unifesto ${path} responded ${res.status}`);
  return res.json();
}

function toEvent(raw: Record<string, unknown>): UpcomingEvent {
  const prices = ((raw.ticketTypes ?? []) as { price?: unknown }[])
    .map((t) => parseFloat(String(t.price)))
    .filter((p) => !Number.isNaN(p));
  const paid = prices.filter((p) => p > 0);
  return {
    slug: String(raw.slug),
    title: String(raw.title),
    start: String(raw.startDateTime ?? raw.start_date),
    timezone: (raw.timezone as string) || "Asia/Kolkata",
    place: [raw.venueName ?? raw.venue, raw.city].filter(Boolean).join(", ") || undefined,
    price: prices.length === 0 ? null : paid.length === 0 ? "Free" : Math.min(...paid),
  };
}

/** Upcoming events, soonest first. `null` means Unifesto couldn't be reached. */
export async function getUpcomingEvents(): Promise<UpcomingEvent[] | null> {
  try {
    const space = await getJson(`/spaces/slug/${encodeURIComponent(UNIFESTO.spaceSlug)}`);
    const data = await getJson(`/events/space/${encodeURIComponent(space.id)}?page=1&limit=12&when=upcoming`);
    return ((data?.data ?? []) as Record<string, unknown>[])
      .map(toEvent)
      .filter((e) => e.slug && e.start)
      .sort((a, b) => a.start.localeCompare(b.start));
  } catch (err) {
    console.error("[events] could not load upcoming events", err);
    return null;
  }
}

/** "Sun, 6 Dec · 1:00 pm" in the event's own time zone. */
export function formatWhen(e: UpcomingEvent) {
  const d = new Date(e.start);
  const day = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: e.timezone }).format(d);
  const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: e.timezone }).format(d);
  return `${day} · ${time}`;
}
