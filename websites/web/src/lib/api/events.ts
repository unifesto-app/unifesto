import { apiBase, withInternal } from "@/lib/api/internal";
import type { Branding } from "@/components/BrandedChrome";
// Universal module (no browser APIs): usable from both Client Components and
// server code such as `generateMetadata` / the OG image routes. Do not add a
// "use client" directive here or server-side callers will break.
// Call the NestJS backend directly. The backend exposes events under `/events`.
// See backends/unifesto-backend/src/events/events.controller.ts.
const API_URL = apiBase(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000");

export interface Event {
  id: string;
  title: string;
  slug: string;
  description?: string;
  short_description?: string;
  banner_url?: string;
  thumbnail_url?: string;
  image_url?: string;
  start_date: string;
  end_date: string;
  registration_start?: string;
  registration_end?: string;
  venue?: string;
  venue_address?: string;
  city?: string;
  state?: string;
  country?: string;
  event_type: string;
  category?: string;
  tags?: string[];
  max_attendees?: number;
  is_free: boolean;
  price?: number;
  currency?: string;
  /** Number of distinct visible ticket/RSVP types (drives "Starting from"). */
  ticket_type_count?: number;
  /** Whether event has at least one free ticket available */
  has_free_tickets?: boolean;
  status: string;
  visibility?: string;
  is_featured: boolean;
  is_trending: boolean;
  // Backend still sends the legacy "organization" wire keys; the frontend
  // treats the hosting entity as a Space. Both are kept for compatibility.
  space_id?: string;
  space?: {
    id: string;
    name: string;
    logo_url?: string;
    slug?: string;
    type?: string;
  };
  organization_id?: string;
  organization?: {
    id: string;
    name: string;
    logo_url?: string;
    slug?: string;
    type?: string;
  };
  created_at: string;
  updated_at: string;
  /**
   * White-label theme, or null for the default Unifesto look. The backend
   * gates it (switched on + plan perk + not suspended).
   */
  branding?: Branding | null;
  /** Spaces co-hosting alongside `space` ("by Host & Co-host"). */
  co_hosts?: { id: string; name: string; slug?: string; logo_url?: string }[];
  /**
   * The parent "big event" this event is a sub-event of, or null/undefined for
   * a top-level event. Present on the event-detail response.
   */
  parent_event?: SubEventSummary | null;
  /**
   * Published sub-events, when this event is itself a "big event" parent.
   * Empty/undefined for an ordinary event.
   */
  sub_events?: SubEventSummary[];
  /**
   * Sponsors attached to this event, already flattened to their effective
   * (roster + per-event override) shape and ordered by tier rank then placement.
   * `lead_capture_enabled` tells the UI whether to offer the "I'm interested"
   * opt-in button. Empty for events with no sponsors.
   */
  sponsors?: PublicSponsor[];
}

/** A sponsor as it appears publicly at an event (see backend EffectiveSponsor). */
export interface PublicSponsor {
  event_sponsor_id: string;
  sponsor_id: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  description: string | null;
  lead_capture_enabled: boolean;
  order: number;
  tier: { id: string; name: string; rank: number; color: string | null } | null;
}

/**
 * A compact event card used for the sub-event hub and parent breadcrumb.
 * A subset of Event — enough to render a card and link through.
 */
export interface SubEventSummary {
  id: string;
  title: string;
  slug: string;
  description?: string;
  banner_url?: string;
  start_date: string;
  end_date?: string;
  venue?: string;
  city?: string;
  event_type?: string;
  status?: string;
  is_free?: boolean;
  price?: number;
  /** True when free tickets exist alongside paid ones. */
  has_free_tickets?: boolean;
  currency?: string;
  registered_count?: number;
  /** How many sub-events this event itself has (>0 ⇒ it's a nested big event). */
  sub_event_count?: number;
}

export interface EventListResponse {
  events: Event[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Fetch with timeout for better UX
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout: number = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, withInternal({
      ...options,
      signal: controller.signal,
    }));
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Normalize a raw backend Event (Prisma camelCase) into the frontend Event
 * shape (snake_case). The backend response shape is defined in
 * backends/unifesto-backend/src/events/events.service.ts.
 */
/**
 * Normalize a raw sub-event / parent card. Handles both the rich `childEvents`
 * shape (with ticketTypes + _count) and the slim `parentEvent` breadcrumb.
 */
export function mapSubEvent(
  raw: Record<string, unknown> | null | undefined,
): SubEventSummary | null {
  if (!raw) return null;
  const r = raw as Record<string, unknown>;

  const ticketTypes = (r.ticketTypes ?? []) as Array<Record<string, unknown>>;
  const prices = ticketTypes
    .map((t) => parseFloat(String(t.price)))
    .filter((n) => !Number.isNaN(n));
  const hasTickets = prices.length > 0;
  const paidPrices = prices.filter((p) => p > 0);
  const hasPaidTickets = paidPrices.length > 0;
  // Cheapest PAID ticket ("Starting from"); free tickets never set the price.
  const minPrice = hasPaidTickets ? Math.min(...paidPrices) : undefined;
  const count = (r._count ?? {}) as Record<string, unknown>;

  return {
    id: r.id as string,
    title: r.title as string,
    slug: r.slug as string,
    description: r.description as string | undefined,
    banner_url: (r.coverImageUrl ?? r.banner_url) as string | undefined,
    start_date: (r.startDateTime ?? r.start_date) as string,
    end_date: (r.endDateTime ?? r.end_date) as string | undefined,
    venue: (r.venueName ?? r.venue) as string | undefined,
    city: r.city as string | undefined,
    event_type: (r.type ?? r.event_type) as string | undefined,
    status: r.status as string | undefined,
    // Free only when there are tickets and none is paid.
    is_free: hasTickets ? !hasPaidTickets : (r.isFree as boolean | undefined),
    price: minPrice,
    has_free_tickets: hasPaidTickets && prices.some((p) => p === 0),
    currency: ticketTypes[0]?.currency as string | undefined,
    registered_count: (r.registeredCount ??
      count.registrations) as number | undefined,
    sub_event_count: count.childEvents as number | undefined,
  };
}

export function mapEvent(raw: Record<string, unknown> | null | undefined): Event | null {
  if (!raw) return null;
  const r = raw as Record<string, unknown>;

  const rawSpace = (r.space ?? null) as Record<string, unknown> | null;
  const space = rawSpace
    ? {
        id: rawSpace.id as string,
        name: rawSpace.name as string,
        logo_url: (rawSpace.logoUrl ?? rawSpace.logo_url) as string | undefined,
        slug: rawSpace.slug as string | undefined,
        type: rawSpace.type as string | undefined,
      }
    : undefined;

  // Pricing is derived from the actual ticket types (source of truth), mirroring
  // the mobile app. The event-level `isFree` column is stale/unreliable, so it's
  // only a fallback when no ticket types are present.
  const ownTicketTypes = (r.ticketTypes ?? []) as Array<Record<string, unknown>>;
  // A "big event" (parent) has no tickets of its own — registration is per
  // sub-event — so inherit its children's ticket prices, else the hero reads
  // "Free". (Card lists inherit server-side; the detail payload carries the
  // children, so we aggregate them here.)
  const childTicketTypes =
    ownTicketTypes.length === 0
      ? ((r.childEvents ?? r.sub_events ?? []) as Array<Record<string, unknown>>).flatMap(
          (c) => ((c?.ticketTypes ?? []) as Array<Record<string, unknown>>),
        )
      : [];
  const ticketTypes = ownTicketTypes.length ? ownTicketTypes : childTicketTypes;
  const prices = ticketTypes
    .map((t) => parseFloat(String(t.price)))
    .filter((n) => !Number.isNaN(n));
  const hasTickets = prices.length > 0;
  const paidPrices = prices.filter((p) => p > 0);
  const hasPaidTickets = paidPrices.length > 0;
  const hasFreeTickets = hasTickets ? prices.some((p) => p === 0) : false;
  // `price` is the "Starting from" figure — the cheapest PAID ticket, never the
  // ₹0 one. A mixed free+paid event must not collapse to a 0 min price (that's
  // what made paid events read "Free"). Undefined when there is nothing to pay.
  const minPrice = hasPaidTickets ? Math.min(...paidPrices) : undefined;
  // Free only when there are ticket types and NONE of them is paid. With no
  // ticket data, fall back to the (unreliable) event-level flag.
  const isFree = hasTickets
    ? !hasPaidTickets
    : ((r.isFree ?? r.is_free ?? true) as boolean);
  const minTicket = hasPaidTickets
    ? ticketTypes.find((t) => parseFloat(String(t.price)) === minPrice)
    : undefined;

  return {
    id: r.id as string,
    title: r.title as string,
    slug: r.slug as string,
    description: r.description as string | undefined,
    banner_url: (r.coverImageUrl ?? r.banner_url ?? r.image_url) as string | undefined,
    image_url: (r.coverImageUrl ?? r.image_url) as string | undefined,
    start_date: (r.startDateTime ?? r.start_date) as string,
    end_date: (r.endDateTime ?? r.end_date) as string,
    venue: (r.venueName ?? r.venue) as string | undefined,
    venue_address: (r.venueAddress ?? r.venue_address) as string | undefined,
    city: r.city as string | undefined,
    state: r.state as string | undefined,
    country: r.country as string | undefined,
    event_type: (r.type ?? r.event_type) as string,
    category: r.category as string | undefined,
    tags: (r.tags ?? []) as string[],
    max_attendees: (r.capacity ?? r.max_attendees) as number | undefined,
    is_free: isFree,
    price: minPrice,
    currency: (minTicket?.currency ?? ticketTypes[0]?.currency) as
      | string
      | undefined,
    ticket_type_count: ticketTypes.length,
    has_free_tickets: hasFreeTickets,
    status: r.status as string,
    visibility: (r.visibility ?? r.event_visibility) as string | undefined,
    is_featured: (r.isFeatured ?? r.is_featured ?? false) as boolean,
    is_trending: (r.isTrending ?? r.is_trending ?? false) as boolean,
    space_id: (r.spaceId ?? r.space_id) as string | undefined,
    space,
    organization_id: (r.spaceId ?? r.space_id) as string | undefined,
    organization: space,
    created_at: (r.createdAt ?? r.created_at) as string,
    updated_at: (r.updatedAt ?? r.updated_at) as string,
    branding: (r.branding ?? null) as Event["branding"],
    co_hosts: ((r.coHosts ?? []) as Array<Record<string, unknown>>).map((h) => ({
      id: h.id as string,
      name: h.name as string,
      slug: h.slug as string | undefined,
      logo_url: (h.logoUrl ?? undefined) as string | undefined,
    })),
    parent_event: mapSubEvent(
      (r.parentEvent ?? r.parent_event) as Record<string, unknown> | null,
    ),
    sub_events: ((r.childEvents ?? r.sub_events ?? []) as Array<
      Record<string, unknown>
    >)
      .map((c) => mapSubEvent(c))
      .filter((c): c is SubEventSummary => Boolean(c)),
    sponsors: ((r.sponsors ?? []) as Array<Record<string, unknown>>).map(
      (s): PublicSponsor => ({
        event_sponsor_id: (s.eventSponsorId ?? s.event_sponsor_id) as string,
        sponsor_id: (s.sponsorId ?? s.sponsor_id) as string,
        name: s.name as string,
        logo_url: (s.logoUrl ?? s.logo_url ?? null) as string | null,
        website_url: (s.websiteUrl ?? s.website_url ?? null) as string | null,
        description: (s.description ?? null) as string | null,
        lead_capture_enabled: Boolean(
          s.leadCaptureEnabled ?? s.lead_capture_enabled,
        ),
        order: (s.order ?? 0) as number,
        tier: (s.tier ?? null) as PublicSponsor["tier"],
      }),
    ),
  };
}

/**
 * Get all events with pagination and filters
 */
export async function getEvents(
  page: number = 1,
  limit: number = 20,
  filters?: {
    search?: string;
    category?: string;
    event_type?: string;
    city?: string;
    is_free?: boolean;
    is_featured?: boolean;
    is_trending?: boolean;
    organization_id?: string;
  }
): Promise<EventListResponse> {
  try {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    // Map frontend filter names to the backend EventFilterDto (camelCase).
    if (filters?.search) params.append('search', filters.search);
    if (filters?.category) params.append('category', filters.category);
    if (filters?.event_type) params.append('type', filters.event_type);
    if (filters?.city) params.append('city', filters.city);
    if (filters?.organization_id) params.append('spaceId', filters.organization_id);

    const response = await fetchWithTimeout(`${API_URL}/events?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }, 10000);

    if (!response.ok) {
      console.error('[API] Error fetching events:', response.status, response.statusText);
      return { events: [], total: 0, page: 1, limit: 20 };
    }

    const data = await response.json();
    const list = (data?.data ?? []) as Record<string, unknown>[];
    return {
      events: list.map((e) => mapEvent(e)!).filter(Boolean),
      total: (data?.total as number) ?? list.length,
      page: (data?.page as number) ?? page,
      limit: (data?.limit as number) ?? limit,
    };
  } catch (error) {
    console.error('[API] Error fetching events:', error);
    return { events: [], total: 0, page: 1, limit: 20 };
  }
}

/**
 * Get event by ID
 */
export async function getEventById(id: string): Promise<Event | null> {
  try {
    // The backend `/events/:slug` route resolves both slugs and UUID ids.
    const response = await fetchWithTimeout(`${API_URL}/events/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }, 10000);

    if (!response.ok) {
      console.error('[API] Error fetching event:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    return mapEvent(data?.id ? data : null);
  } catch (error) {
    console.error('[API] Error fetching event:', error);
    return null;
  }
}

/**
 * Get event by slug
 */
export async function getEventBySlug(slug: string): Promise<Event | null> {
    const response = await fetchWithTimeout(`${API_URL}/events/${slug}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }, 10000);

    // Only a 404 means "no such event". Anything else (5xx, timeout) throws, so
    // the server page errors out instead of telling crawlers to noindex a live
    // event during an API blip.
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Error fetching event by slug: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return mapEvent(data?.id ? data : null);
}

/**
 * Get featured events
 */
export async function getFeaturedEvents(limit: number = 10): Promise<Event[]> {
  // The backend has no dedicated featured endpoint; fall back to the most
  // recent published events.
  const { events } = await getEvents(1, limit);
  return events;
}

/**
 * Get trending events
 */
export async function getTrendingEvents(limit: number = 10): Promise<Event[]> {
  // The backend has no dedicated trending endpoint; fall back to the most
  // recent published events.
  const { events } = await getEvents(1, limit);
  return events;
}

/**
 * Filter events (client-side for compatibility)
 */
export function filterEvents(
  events: Event[],
  filters: {
    query?: string;
    category?: string;
    status?: string;
    price?: "all" | "free" | "paid";
    dateRange?: "all" | "today" | "week" | "upcoming";
  }
): Event[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);

  return events.filter((e) => {
    // Query filter
    const matchesQuery =
      !filters.query ||
      e.title.toLowerCase().includes(filters.query.toLowerCase()) ||
      e.description?.toLowerCase().includes(filters.query.toLowerCase()) ||
      e.organization?.name.toLowerCase().includes(filters.query.toLowerCase());

    // Category filter
    const matchesCategory =
      !filters.category ||
      filters.category === "All" ||
      e.category === filters.category;

    // Price filter
    const matchesPrice =
      !filters.price ||
      filters.price === "all" ||
      (filters.price === "free" && e.is_free) ||
      (filters.price === "paid" && !e.is_free);

    // Date range filter
    const eventDate = new Date(e.start_date);
    const matchesDate =
      !filters.dateRange ||
      filters.dateRange === "all" ||
      (filters.dateRange === "today" &&
        eventDate.toDateString() === today.toDateString()) ||
      (filters.dateRange === "week" &&
        eventDate >= today &&
        eventDate <= weekEnd) ||
      (filters.dateRange === "upcoming" && eventDate >= today);

    return matchesQuery && matchesCategory && matchesPrice && matchesDate;
  });
}

// Constants for filters
export const ALL_CATEGORIES = [
  "All",
  "Technology",
  "Business",
  "Arts & Culture",
  "Sports",
  "Education",
  "Health & Wellness",
  "Music",
  "Food & Drink",
  "Community",
  "Other",
];

export const STATUS_TABS = [
  { key: "all", label: "All Events" },
  { key: "upcoming", label: "Upcoming" },
  { key: "ongoing", label: "Ongoing" },
  { key: "past", label: "Past" },
];

export const DATE_FILTERS = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "upcoming", label: "Upcoming" },
];

export const PRICE_FILTERS = [
  { key: "all", label: "All" },
  { key: "free", label: "Free" },
  { key: "paid", label: "Paid" },
];
