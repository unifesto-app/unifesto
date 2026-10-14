import { apiBase, withInternal } from "@/lib/api/internal";
/**
 * Additional Info API Client (Public Frontend)
 * Agenda, speakers, prizes, contacts, and FAQ for public event pages.
 *
 * The backend bundles these sections into the event payload
 * (`GET /events/:id` → { agenda, speakers, prizes, contacts, faqs }). We fetch
 * the event once and map the backend's camelCase rows onto the snake_case
 * shapes the event page renders.
 */

// Call the NestJS backend directly, mirroring src/lib/api/events.ts.
const API_URL = apiBase(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000");

// ==========================================
// TYPES (as consumed by the public event page)
// ==========================================

export interface AgendaItem {
  id: string;
  event_id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  location?: string;
  speaker_ids?: string[];
  display_order: number;
}

export interface Speaker {
  id: string;
  event_id: string;
  name: string;
  title?: string;
  bio?: string;
  profile_image_url?: string;
  email?: string;
  phone?: string;
  social_links?: Record<string, string>;
  display_order: number;
  is_featured: boolean;
}

export interface Prize {
  id: string;
  event_id: string;
  name: string;
  description?: string;
  value?: string;
  position?: number;
  display_order: number;
}

export interface Faq {
  id: string;
  event_id: string;
  question: string;
  answer: string;
  category?: string;
  display_order: number;
  is_published: boolean;
}

export interface Contact {
  id: string;
  event_id: string;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  display_order: number;
}

export interface AdditionalInfo {
  agenda: AgendaItem[];
  speakers: Speaker[];
  prizes: Prize[];
  contacts: Contact[];
  faqs: Faq[];
}

// ==========================================
// BACKEND ROW SHAPES (camelCase, as returned by Prisma)
// ==========================================

interface RawAgenda {
  id: string;
  eventId: string;
  title: string;
  description?: string | null;
  startTime: string;
  endTime?: string | null;
  speakerName?: string | null;
  order: number;
}

interface RawSpeaker {
  id: string;
  eventId: string;
  name: string;
  bio?: string | null;
  avatarUrl?: string | null;
  designation?: string | null;
  company?: string | null;
  linkedinUrl?: string | null;
  order: number;
}

interface RawPrize {
  id: string;
  eventId: string;
  title: string;
  description?: string | null;
  rank?: string | null;
  value?: string | null;
  order: number;
}

interface RawContact {
  id: string;
  eventId: string;
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  order: number;
}

interface RawFaq {
  id: string;
  eventId: string;
  question: string;
  answer: string;
  order: number;
}

interface RawEventSections {
  agenda?: RawAgenda[];
  speakers?: RawSpeaker[];
  prizes?: RawPrize[];
  contacts?: RawContact[];
  faqs?: RawFaq[];
}

// ==========================================
// MAPPERS
// ==========================================

function mapAgenda(row: RawAgenda): AgendaItem {
  return {
    id: row.id,
    event_id: row.eventId,
    title: row.title,
    description: row.description ?? undefined,
    start_time: row.startTime,
    end_time: row.endTime ?? undefined,
    display_order: row.order ?? 0,
  };
}

function mapSpeaker(row: RawSpeaker): Speaker {
  const title = [row.designation, row.company].filter(Boolean).join(" · ");
  return {
    id: row.id,
    event_id: row.eventId,
    name: row.name,
    title: title || undefined,
    bio: row.bio ?? undefined,
    profile_image_url: row.avatarUrl ?? undefined,
    social_links: row.linkedinUrl ? { linkedin: row.linkedinUrl } : undefined,
    display_order: row.order ?? 0,
    is_featured: false,
  };
}

function mapPrize(row: RawPrize): Prize {
  // Surface a numeric medal position when the rank starts with a digit
  // (e.g. "1st Prize"); otherwise keep the rank as part of the name.
  const match = row.rank?.match(/\d+/);
  const position = match ? parseInt(match[0], 10) : undefined;
  const name =
    row.rank && position === undefined ? `${row.rank}: ${row.title}` : row.title;
  return {
    id: row.id,
    event_id: row.eventId,
    name,
    description: row.description ?? undefined,
    value: row.value ?? undefined,
    position,
    display_order: row.order ?? 0,
  };
}

function mapContact(row: RawContact): Contact {
  return {
    id: row.id,
    event_id: row.eventId,
    name: row.name,
    role: row.role ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    display_order: row.order ?? 0,
  };
}

function mapFaq(row: RawFaq): Faq {
  return {
    id: row.id,
    event_id: row.eventId,
    question: row.question,
    answer: row.answer,
    display_order: row.order ?? 0,
    is_published: true,
  };
}

// ==========================================
// HELPER
// ==========================================

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = 10000
) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, withInternal({ ...options, signal: controller.signal }));
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

const EMPTY: AdditionalInfo = {
  agenda: [],
  speakers: [],
  prizes: [],
  contacts: [],
  faqs: [],
};

// ==========================================
// PUBLIC API (No auth required)
// ==========================================

/**
 * Fetch an event's additional-info sections. `eventIdOrSlug` may be an id or a
 * slug — the backend's `GET /events/:slug` accepts both.
 */
export async function getEventAdditionalInfo(
  eventIdOrSlug: string
): Promise<AdditionalInfo> {
  try {
    const response = await fetchWithTimeout(
      `${API_URL}/events/${eventIdOrSlug}`,
      { method: "GET", headers: { "Content-Type": "application/json" } }
    );
    if (!response.ok) return EMPTY;

    const event = (await response.json()) as RawEventSections;
    const byOrder = <T extends { display_order: number }>(a: T, b: T) =>
      a.display_order - b.display_order;

    return {
      agenda: (event.agenda ?? []).map(mapAgenda).sort(byOrder),
      speakers: (event.speakers ?? []).map(mapSpeaker).sort(byOrder),
      prizes: (event.prizes ?? []).map(mapPrize).sort(byOrder),
      contacts: (event.contacts ?? []).map(mapContact).sort(byOrder),
      faqs: (event.faqs ?? []).map(mapFaq).sort(byOrder),
    };
  } catch (error) {
    console.error("Error fetching additional info:", error);
    return EMPTY;
  }
}

export async function getEventAgenda(eventId: string): Promise<AgendaItem[]> {
  return (await getEventAdditionalInfo(eventId)).agenda;
}

export async function getEventSpeakers(eventId: string): Promise<Speaker[]> {
  return (await getEventAdditionalInfo(eventId)).speakers;
}

export async function getEventPrizes(eventId: string): Promise<Prize[]> {
  return (await getEventAdditionalInfo(eventId)).prizes;
}

export async function getEventContacts(eventId: string): Promise<Contact[]> {
  return (await getEventAdditionalInfo(eventId)).contacts;
}

export async function getEventFaqs(eventId: string): Promise<Faq[]> {
  return (await getEventAdditionalInfo(eventId)).faqs;
}
