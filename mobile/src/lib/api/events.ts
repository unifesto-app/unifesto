import { expectOk, makeAuthenticatedRequest, makeOptionalAuthRequest, makePublicRequest } from './helpers';

/**
 * Organiser white-label theme (backend `branding.util`). Set only when the
 * space's branding is on, its plan allows it and it isn't suspended; an event
 * may carry just a colour override, with `name` null.
 */
export interface Branding {
  /** Space name for the branded header; null when only an event colour applies. */
  name?: string | null;
  color: string | null;
  /** Header logo: the wide brand wordmark, else the square space logo. */
  logoUrl?: string | null;
  font?: string | null;
  mode?: 'light' | 'dark' | null;
  hidePoweredBy?: boolean;
  faviconUrl?: string | null;
}

export interface Event {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  coverImageUrl: string | null;
  type: 'IN_PERSON' | 'ONLINE' | 'HYBRID';
  registrationType: 'RSVP' | 'TICKETED' | 'MIXED';
  startDateTime: string;
  endDateTime: string;
  timezone: string;
  venueName: string | null;
  venueAddress: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  onlineUrl: string | null;
  onlinePlatform?: string | null;
  capacity: number | null;
  registeredCount: number;
  waitlistEnabled: boolean;
  /** The organiser absorbs the buyer fee: buyers pay the listed price (A33). */
  absorbProcessingFee?: boolean;
  isFree: boolean;
  tags: string[];
  category: string | null;
  /** Every category, primary first. Older events may only have `category`. */
  categories?: string[];
  visibility: 'PUBLIC' | 'PRIVATE' | 'SPACE_ONLY';
  status: 'DRAFT' | 'PUBLISHED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  spaceId: string;
  createdBy: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  space?: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    bannerUrl?: string | null;
  };
  /**
   * Spaces co-hosting this event alongside the owning `space`. Surfaced on the
   * event-detail response for the attendee-facing "by <host> & <co-host>"
   * credit; empty/undefined for a single-host event.
   */
  coHosts?: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
  }[];
  /**
   * The event's Curators and Co-Curators, for the attendee-facing "Curated by"
   * card. Space Admins and Crew are intentionally excluded by the backend.
   */
  curators?: EventCurator[];
  creator?: {
    id: string;
    fullName: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
  ticketTypes?: TicketType[];
  speakers?: EventSpeaker[];
  agenda?: EventAgenda[];
  /**
   * Sponsors attached to this event, flattened to their effective (roster +
   * per-event override) shape and ordered by tier rank then placement (see
   * backend `resolveEffectiveSponsor`). `leadCaptureEnabled` drives the
   * attendee "I'm interested" opt-in button. Empty for events with no sponsors.
   */
  sponsors?: EventSponsor[];
  /** Organiser white-label branding, or null for the default Unifesto look. */
  branding?: Branding | null;
  /**
   * The parent "big event" this event is a sub-event of, or null for a
   * top-level event. Present on the event-detail response.
   */
  parentEvent?: SubEvent | null;
  parentEventId?: string | null;
  /** A recurring series parent (its RRULE drives the occurrences). */
  isRecurring?: boolean;
  recurringRule?: string | null;
  /** Set on an occurrence of a series. */
  seriesParentId?: string | null;
  /**
   * Published sub-events, when this event is itself a "big event" parent.
   * Empty/undefined for an ordinary event.
   */
  childEvents?: SubEvent[];
  /**
   * Organiser's WhatsApp invite links. `whatsappGroupUrl` for a sub-event or
   * standalone event; `whatsappCommunityUrl` (the umbrella) for a big event.
   * Created by hand in WhatsApp and pasted by the organiser — no auto-create.
   */
  whatsappGroupUrl?: string | null;
  whatsappCommunityUrl?: string | null;
  /** Team leads may replace a member of their group (curator switch). */
  allowTeamChanges?: boolean;
  teamChangesUntil?: string | null;
  /** Attendees may edit their registration details (curator switch)… */
  attendeeEditsEnabled?: boolean;
  /** …until this time (null = no deadline). */
  attendeeEditsUntil?: string | null;
}

/**
 * A person who curates the event, as surfaced on the public event detail.
 * `roleCode` is the stable backend code (CURATOR | CO_CURATOR); the UI maps it
 * to the attendee-facing label.
 */
export interface EventCurator {
  id: string;
  fullName: string | null;
  username: string | null;
  avatarUrl: string | null;
  roleCode: 'CURATOR' | 'CO_CURATOR';
}

/**
 * A compact event card for the sub-event hub and parent breadcrumb — a subset
 * of Event, enough to render a card and navigate through.
 */
export interface SubEvent {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  coverImageUrl?: string | null;
  type?: 'IN_PERSON' | 'ONLINE' | 'HYBRID';
  status?: string;
  startDateTime: string;
  endDateTime?: string;
  venueName?: string | null;
  city?: string | null;
  isFree?: boolean;
  registeredCount?: number;
  ticketTypes?: { price: string; currency: string }[];
  // `childEvents` > 0 ⇒ this sub-event is itself a nested "big event".
  _count?: { registrations?: number; childEvents?: number };
  // Present on a parent breadcrumb so a sub-event can fall back to the big
  // event's WhatsApp community when it has no group link of its own.
  whatsappCommunityUrl?: string | null;
}

export interface TicketType {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  totalQuantity: number;
  soldCount: number;
  perUserLimit: number;
  isVisible: boolean;
  isActive: boolean;
}

export interface EventSpeaker {
  id: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  designation: string | null;
  company: string | null;
  linkedinUrl: string | null;
  order: number;
}

/** A sponsor as it appears publicly at an event (backend EffectiveSponsor). */
export interface EventSponsor {
  eventSponsorId: string;
  sponsorId: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  description: string | null;
  leadCaptureEnabled: boolean;
  order: number;
  tier: { id: string; name: string; rank: number; color: string | null } | null;
}

export interface EventAgenda {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  speakerName: string | null;
  order: number;
}

export const getEvents = async (params?: {
  page?: number;
  limit?: number;
  city?: string;
  category?: string;
  search?: string;
  isFree?: boolean;
  type?: 'IN_PERSON' | 'ONLINE' | 'HYBRID';
  startDate?: string;
  endDate?: string;
  /** No paid ticket type. */
  free?: boolean;
}) => {
  const query = new URLSearchParams();
  if (params?.page) query.append('page', String(params.page));
  if (params?.limit) query.append('limit', String(params.limit));
  if (params?.city) query.append('city', params.city);
  if (params?.category) query.append('category', params.category);
  if (params?.search) query.append('search', params.search);
  if (params?.isFree !== undefined) query.append('isFree', String(params.isFree));
  if (params?.type) query.append('type', params.type);
  if (params?.startDate) query.append('startDate', params.startDate);
  if (params?.endDate) query.append('endDate', params.endDate);
  if (params?.free) query.append('free', 'true');

  // Throws on failure so lists can show "Couldn't load" instead of "No events yet".
  return expectOk(await makePublicRequest(`/events?${query.toString()}`), "Couldn't load events");
};

export const getEventBySlug = async (slug: string) => {
  const response = await makeOptionalAuthRequest(`/events/${slug}`);
  if (!response?.ok) return null;
  return response.json() as Promise<Event>;
};

export interface PaletteColor {
  hex: string;
  /** Share of the banner's pixels, 0–100. */
  percent: number;
}

/** Banner colours ranked by pixel share, most frequent first (up to 3). */
export const getEventPalette = async (slugOrId: string): Promise<PaletteColor[]> => {
  const response = await makeOptionalAuthRequest(`/events/${slugOrId}/palette`);
  if (!response?.ok) return [];
  const body = await response.json();
  return Array.isArray(body?.colors) ? body.colors : [];
};

export const getEventById = async (id: string) => {
  const response = await makeOptionalAuthRequest(`/events/${id}`);
  if (!response?.ok) return null;
  return response.json() as Promise<Event>;
};

export const getMyRegistration = async (eventId: string) => {
  const response = await makeAuthenticatedRequest(`/events/${eventId}/my-registration`);
  if (!response?.ok) return null;
  return response.json();
};

/**
 * Helper function to get currency symbol
 */
export function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    INR: '₹',
    USD: '$',
    EUR: '€',
    GBP: '£',
  };
  return symbols[currency] || currency;
}

/**
 * Get display price for an event card
 */
export function getEventCardPrice(event: { isFree?: boolean; ticketTypes?: TicketType[] }): { price: string; subLabel?: string } {
  // Prefer the actual ticket prices over the `isFree` flag — that flag defaults
  // to true server-side and is never recomputed when paid tickets are added, so
  // paid events routinely carry isFree: true.
  if (event.ticketTypes && event.ticketTypes.length > 0) {
    const prices = event.ticketTypes.map(t => parseFloat(t.price));
    const paidPrices = prices.filter(p => p > 0);
    const hasFreeTickets = prices.some(p => p === 0);
    const currency = event.ticketTypes[0].currency;
    const symbol = getCurrencySymbol(currency);

    // No paid ticket → genuinely free.
    if (paidPrices.length === 0) {
      return { price: 'Free' };
    }

    // "Starting from" always uses the cheapest PAID ticket (not the ₹0 one).
    const minPaid = Math.min(...paidPrices);

    // Mixed: free tickets alongside paid ones.
    if (hasFreeTickets) {
      return {
        price: `Starting from ${symbol}${minPaid}`,
        subLabel: 'Free Tickets Available',
      };
    }

    // Paid tickets only.
    return { price: `Starting from ${symbol}${minPaid}` };
  }

  // No ticket data loaded — fall back to the flag.
  if (event.isFree === true) {
    return { price: 'Free' };
  }
  if (event.isFree === false) {
    return { price: 'Paid' };
  }

  return { price: 'Free' };
}

/**
 * Get display price for an event
 */
export function getEventDisplayPrice(event: Event): string {
  // Ticket prices are the source of truth; `isFree` is only a fallback (it
  // defaults to true and is not recomputed when paid tickets are added).
  return getEventCardPrice(event).price;
}


/** My tickets. `scope` 'active' (default) leaves out cancelled tickets;
 *  'cancelled' returns only those (including fully refunded ones). */
export const getMyRegisteredEvents = async (
  page = 1,
  limit = 20,
  scope: 'active' | 'cancelled' = 'active',
) => {
  const response = await makeAuthenticatedRequest(
    `/users/me/registrations?page=${page}&limit=${limit}&scope=${scope}`,
  );
  // Throws on failure: an empty list would read as "no tickets" (and wipe the widget).
  return expectOk(response, "Couldn't load your tickets");
};

export const getFeaturedEvents = async (limit = 10) => {
  const params = new URLSearchParams({ limit: String(limit), featured: 'true' });
  const response = await makePublicRequest(`/events?${params.toString()}`);
  if (!response?.ok) return [];
  const data = await response.json();
  return data.events || data.data || [];
};

export const getTrendingEvents = async (limit = 10) => {
  const params = new URLSearchParams({ limit: String(limit), trending: 'true' });
  const response = await makePublicRequest(`/events?${params.toString()}`);
  if (!response?.ok) return [];
  const data = await response.json();
  return data.events || data.data || [];
};


export const isRegisteredForEvent = async (eventId: string): Promise<boolean> => {
  const data = await getMyRegistrationForEvent(eventId);
  return !!data;
};

export const getMyRegistrationForEvent = async (eventId: string): Promise<any | null> => {
  const response = await makeAuthenticatedRequest(`/events/${eventId}/my-registration`);
  if (!response?.ok) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    // A cancelled ticket isn't "my registration" (older servers still return it).
    return data && data.status !== 'CANCELLED' ? data : null;
  } catch {
    return null;
  }
};

export const getMyRegistrationsForEvent = async (eventId: string): Promise<any[]> => {
  const response = await makeAuthenticatedRequest(`/events/${eventId}/my-registrations`);
  if (!response?.ok) return [];
  const text = await response.text();
  if (!text) return [];
  try {
    const data = JSON.parse(text);
    // Live tickets only; older servers also return cancelled ones.
    return Array.isArray(data) ? data.filter((r: any) => r?.status !== 'CANCELLED') : [];
  } catch {
    return [];
  }
};

export const getCategories = async () => {
  const response = await makePublicRequest('/categories');
  if (!response?.ok) return [];
  return response.json();
};
