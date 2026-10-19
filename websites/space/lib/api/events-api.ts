/**
 * Events API — organiser surface.
 * Backed by `/events` endpoints.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type EventType = "IN_PERSON" | "ONLINE" | "HYBRID";
// Mirrors the backend `EventStatus` enum. ONGOING and COMPLETED were missing
// here, which mattered once soft delete keyed off COMPLETED.
export type EventStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "ONGOING"
  | "COMPLETED"
  | "CANCELLED";
export type EventVisibility = "PUBLIC" | "PRIVATE" | "SPACE_ONLY";
/** Backend enum. The wizard offers RSVP (free) and TICKETED (paid); MIXED comes from older events. */
export type RegistrationType = "RSVP" | "TICKETED" | "MIXED";

export type TicketKind = "RSVP" | "INDIVIDUAL" | "GROUP";
export type GroupPricingMode = "PER_GROUP" | "PER_PERSON";

export interface EventTicketType {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  kind: TicketKind;
  groupPricingMode?: GroupPricingMode | null;
  minGroupSize?: number | null;
  maxGroupSize?: number | null;
  /** null = unlimited capacity. */
  totalQuantity: number | null;
  soldCount: number;
  saleStartsAt?: string;
  saleEndsAt?: string;
  perUserLimit: number;
  isVisible: boolean;
  isActive: boolean;
  order: number;
  /** Ticket types this one blocks: holders of this ticket cannot register for them. */
  blocks?: { blockedId: string }[];
  /** Ticket types that block this one: their holders cannot register for this ticket. */
  blockedBy?: { blockerId: string }[];
  /** Queue buyers once this ticket sells out. Requires a capacity. */
  waitlistEnabled: boolean;
  /** Hours someone let in off the queue has to pay before the seat is released. */
  waitlistOfferTtlHours: number;
  /** Per-ticket-type WhatsApp group link; overrides the event group for holders. */
  whatsappGroupUrl?: string | null;
}

export interface EventAgenda {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  speakerName?: string;
  order: number;
}

export interface EventSpeaker {
  id: string;
  name: string;
  bio?: string;
  avatarUrl?: string;
  designation?: string;
  company?: string;
  linkedinUrl?: string;
  order: number;
}

export interface EventPrize {
  id: string;
  title: string;
  description?: string;
  /** e.g. "1st Prize", "Runner-up", "Takeaway". */
  rank?: string;
  /** e.g. "₹50,000", "Certificate + Swag". */
  value?: string;
  order: number;
}

export interface EventContact {
  id: string;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  order: number;
}

export interface EventFaq {
  id: string;
  question: string;
  answer: string;
  order: number;
}

export interface Event {
  id: string;
  title: string;
  slug: string;
  description?: string;
  coverImageUrl?: string;
  type: EventType;
  registrationType: RegistrationType;
  startDateTime: string;
  endDateTime: string;
  timezone: string;
  venueName?: string;
  venueAddress?: string;
  city?: string;
  state?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  onlineUrl?: string;
  onlinePlatform?: string;
  capacity?: number;
  registeredCount: number;
  waitlistEnabled: boolean;
  waitlistCount: number;
  isFree: boolean;
  /** The organiser absorbs the buyer fee: buyers pay the listed price (A33). */
  absorbProcessingFee?: boolean;
  /**
   * Whether an organiser may add attendees for free (comp a paid ticket) on this
   * event. Off by default; a Platform Admin flips it on by approving a free-add
   * request. When false, the manual-add "collect payment" toggle is forced on.
   */
  allowFreeAttendeeAdd?: boolean;
  /** Team leads may change their team (see AttendeeControls). */
  allowTeamChanges?: boolean;
  teamChangesUntil?: string | null;
  /** Attendees may edit their own registration answers. */
  attendeeEditsEnabled?: boolean;
  attendeeEditsUntil?: string | null;
  tags: string[];
  category?: string;
  visibility: EventVisibility;
  status: EventStatus;
  spaceId: string;
  /**
   * The parent "big event" this event is a sub-event of, or null for a
   * top-level event. Set via attach/detach; present on detail + list reads.
   */
  parentEventId?: string | null;
  /** Slim parent breadcrumb, present on detail + space-list reads. */
  parentEvent?: {
    id: string;
    title: string;
    slug: string;
    coverImageUrl?: string | null;
  } | null;
  /** Published sub-events, present on the public detail read of a parent. */
  childEvents?: SubEvent[];
  /**
   * The private WhatsApp attendee invite group is intentionally NOT part of this
   * (public) event shape — it never rides on `GET /events/:slug`. Load and edit
   * it through `getEventWhatsappConfig` / the event WhatsApp page instead.
   */
  /**
   * Recurring series (event-calendar P2). `isRecurring` marks a non-registerable
   * SERIES PARENT whose `recurringRule` (RFC-5545 RRULE) drives materialized
   * occurrences. An OCCURRENCE instead carries `seriesParentId`; `seriesDetached`
   * is true once it has been edited individually.
   */
  isRecurring?: boolean;
  recurringRule?: string | null;
  seriesParentId?: string | null;
  seriesDetached?: boolean;
  space?: {
    id: string;
    name: string;
    slug: string;
  };
  createdBy: string;
  creator?: {
    id: string;
    fullName: string;
    username?: string;
    avatarUrl?: string;
  };
  publishedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  /** Non-null when the event is hidden. Only ever set on completed/cancelled. */
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  ticketTypes?: EventTicketType[];
  agenda?: EventAgenda[];
  speakers?: EventSpeaker[];
  prizes?: EventPrize[];
  contacts?: EventContact[];
  faqs?: EventFaq[];
  formFields?: EventFormField[];
  /** True in a space's event list when the event is owned by a different space. */
  isCoHost?: boolean;
  /**
   * Headcount split by how people booked, present on the space event list.
   * Counts *people*, not bookings — a group of twenty is twenty attendees and
   * one group.
   */
  attendees?: {
    total: number;
    individual: number;
    groupAttendees: number;
    groups: number;
  };
  _count?: {
    registrations?: number;
    /** Number of sub-events, present on the space-list read. */
    childEvents?: number;
  };
}

/**
 * A compact sub-event card, as returned by the sub-event endpoints and the
 * `childEvents` include. A subset of Event, enough to list and link through.
 */
export interface SubEvent {
  id: string;
  title: string;
  slug: string;
  description?: string;
  coverImageUrl?: string | null;
  type: EventType;
  status: EventStatus;
  visibility: EventVisibility;
  startDateTime: string;
  endDateTime: string;
  timezone: string;
  venueName?: string;
  city?: string;
  isFree: boolean;
  capacity?: number;
  registeredCount: number;
  deletedAt?: string | null;
  ticketTypes?: { price: string; currency: string }[];
  _count?: { registrations?: number };
}

export interface CreateEventPayload {
  title: string;
  description?: string;
  type: EventType;
  registrationType: RegistrationType;
  startDateTime: string;
  endDateTime: string;
  timezone?: string;
  venueName?: string;
  venueAddress?: string;
  city?: string;
  state?: string;
  country?: string;
  /** null clears a previously saved pin. */
  latitude?: number | null;
  longitude?: number | null;
  onlineUrl?: string;
  onlinePlatform?: string;
  capacity?: number;
  waitlistEnabled?: boolean;
  /** Include the buyer fee in ticket prices. Needs money rights (A33). */
  absorbProcessingFee?: boolean;
  isFree?: boolean;
  tags?: string[];
  category?: string;
  visibility: EventVisibility;
  spaceId: string;
  /** Attach as a sub-event of this parent on creation (same space). */
  parentEventId?: string;
  /**
   * Private WhatsApp attendee invite group. Pushed only to registered attendees
   * (never public), so it does not leak on older app versions. Pass an empty
   * string to clear it. Validated + normalised server-side.
   */
  whatsappAttendeeGroupUrl?: string;
  /**
   * Make this a recurring series (RFC-5545 RRULE, e.g. "FREQ=WEEKLY;BYDAY=SA;
   * COUNT=10"). The created event becomes a non-registerable series parent;
   * occurrences are materialized when it is published. Cannot be combined with
   * `parentEventId`.
   */
  recurrenceRule?: string;
}

/** Optional text fields an edit can clear: null clears, undefined leaves as is. */
type ClearableEventField =
  | "description"
  | "venueName"
  | "venueAddress"
  | "city"
  | "state"
  | "onlineUrl"
  | "onlinePlatform"
  | "category";

export type UpdateEventPayload = Omit<Partial<CreateEventPayload>, ClearableEventField> & {
  [K in ClearableEventField]?: CreateEventPayload[K] | null;
} & {
  /** URL slug — lowercase letters, numbers and hyphens; must be unique. */
  slug?: string;
};

/** An update where null clears an optional field. */
export type Clearing<T> = { [K in keyof T]?: T[K] | null };

export interface EventListParams {
  page?: number;
  limit?: number;
  status?: EventStatus;
  /**
   * Which side of the soft-delete line to fetch. Omitted means 'active' —
   * hidden events never appear unless asked for.
   */
  deleted?: "active" | "deleted" | "all";
}

export interface EventListResponse {
  events: Event[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Get events for a space (includes drafts for organizers).
 * Backed by `GET /events/space/:spaceId`.
 */
export async function getSpaceEvents(
  spaceId: string,
  params?: EventListParams
): Promise<{ data: EventListResponse | null; error: ApiError | null }> {
  const { data, error } = await apiCall<{
    data: Event[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>(
    backendClient.get(`/events/space/${spaceId}`, { params })
  );

  if (error) return { data: null, error };
  if (!data) return { data: null, error: null };

  return {
    data: {
      events: data.data || [],
      pagination: {
        page: data.page || 1,
        limit: data.limit || 20,
        total: data.total || 0,
        totalPages: data.totalPages || 1,
      },
    },
    error: null,
  };
}

/**
 * Get a single event by slug.
 * Backed by `GET /events/:slug`.
 */
export async function getEventBySlug(
  slug: string
): Promise<{ data: Event | null; error: ApiError | null }> {
  return apiCall<Event>(backendClient.get(`/events/${slug}`));
}

/**
 * Get a single event by ID.
 * Backed by `GET /events/:id`.
 */
export async function getEventById(
  id: string
): Promise<{ data: Event | null; error: ApiError | null }> {
  return apiCall<Event>(backendClient.get(`/events/${id}`));
}

/** One ticket tier's optional WhatsApp group override, for the WhatsApp page. */
export interface WhatsAppTicketGroup {
  id: string;
  name: string;
  whatsappGroupUrl: string | null;
}

/** The private WhatsApp invite config, from `GET /events/:id/whatsapp`. */
export interface EventWhatsAppConfig {
  /** The event-level attendee invite group (null when unset). */
  whatsappAttendeeGroupUrl: string | null;
  /**
   * For a sub-event with no group of its own: the parent big event's attendee
   * group that invites fall back to (read-only). null for a standalone/parent
   * event or when the parent has none.
   */
  parentAttendeeGroupUrl: string | null;
  /** Per-ticket-type overrides, in display order. */
  ticketTypes: WhatsAppTicketGroup[];
}

/**
 * The event's private WhatsApp attendee-group config. Manage-only — this data
 * never appears on the public event payload.
 * Backed by `GET /events/:id/whatsapp`.
 */
export async function getEventWhatsappConfig(
  eventId: string
): Promise<{ data: EventWhatsAppConfig | null; error: ApiError | null }> {
  return apiCall<EventWhatsAppConfig>(
    backendClient.get(`/events/${eventId}/whatsapp`)
  );
}

/**
 * Create a new event.
 * Backed by `POST /events`.
 */
export async function createEvent(
  payload: CreateEventPayload
): Promise<{ data: Event | null; error: ApiError | null }> {
  return apiCall<Event>(backendClient.post("/events", payload));
}

/**
 * Update an event.
 * Backed by `PATCH /events/:id`.
 */
export async function updateEvent(
  id: string,
  payload: UpdateEventPayload
): Promise<{ data: Event | null; error: ApiError | null }> {
  return apiCall<Event>(backendClient.patch(`/events/${id}`, payload));
}

/**
 * Publish an event (move from DRAFT to PUBLISHED).
 * Backed by `PATCH /events/:id/publish`.
 */
export async function publishEvent(
  id: string
): Promise<{ data: Event | null; error: ApiError | null }> {
  return apiCall<Event>(backendClient.patch(`/events/${id}/publish`));
}

/**
 * Push an announcement to everyone registered for the event.
 * Backed by `POST /events/:eventId/announcements` (3 per event per 24h).
 */
export async function announceToAttendees(
  eventId: string,
  input: { title: string; body: string }
): Promise<{ data: unknown; error: ApiError | null }> {
  return apiCall(backendClient.post(`/events/${eventId}/announcements`, input));
}

/** One materialized occurrence of a recurring series (management view). */
export interface SeriesOccurrence {
  id: string;
  slug: string;
  title: string;
  startDateTime: string;
  endDateTime: string;
  status: EventStatus;
  registeredCount: number;
  /** True once the occurrence has been edited individually (frozen from series edits). */
  seriesDetached: boolean;
}

export interface SeriesOccurrencesResponse {
  seriesId: string;
  recurrenceRule: string | null;
  /** Far edge of the materialized rolling window, ISO. */
  generatedUntil: string | null;
  occurrences: SeriesOccurrence[];
}

/**
 * List a recurring series' materialized occurrences.
 * Backed by `GET /events/:id/occurrences`.
 */
export async function getSeriesOccurrences(
  id: string
): Promise<{ data: SeriesOccurrencesResponse | null; error: ApiError | null }> {
  return apiCall<SeriesOccurrencesResponse>(
    backendClient.get(`/events/${id}/occurrences`)
  );
}

/**
 * Detach one occurrence from its series so a later whole-series edit never
 * overwrites it ("this occurrence" edit scope).
 * Backed by `POST /events/:id/detach-from-series`.
 */
export async function detachOccurrence(
  id: string
): Promise<{ data: { id: string; seriesDetached: boolean } | null; error: ApiError | null }> {
  return apiCall<{ id: string; seriesDetached: boolean }>(
    backendClient.post(`/events/${id}/detach-from-series`)
  );
}

/**
 * Cancel an event.
 * Backed by `PATCH /events/:id/cancel`.
 */
export async function cancelEvent(
  id: string,
  reason?: string
): Promise<{ data: Event | null; error: ApiError | null }> {
  return apiCall<Event>(
    backendClient.patch(`/events/${id}/cancel`, { reason })
  );
}

/** Curator switches for team changes and attendee detail edits. Deadlines: null = until the event ends. */
export interface AttendeeControls {
  allowTeamChanges: boolean;
  teamChangesUntil: string | null;
  teamChangesOpen: boolean;
  attendeeEditsEnabled: boolean;
  attendeeEditsUntil: string | null;
  attendeeEditsOpen: boolean;
}

/** Backed by `PATCH /events/:eventId/attendee-controls` (event:edit). */
export async function setAttendeeControls(
  id: string,
  body: Partial<
    Pick<AttendeeControls, "allowTeamChanges" | "teamChangesUntil" | "attendeeEditsEnabled" | "attendeeEditsUntil">
  >
): Promise<{ data: AttendeeControls | null; error: ApiError | null }> {
  return apiCall<AttendeeControls>(backendClient.patch(`/events/${id}/attendee-controls`, body));
}

/**
 * Hide a completed or cancelled event. Reversible: registrations, tickets and
 * payments are untouched and reappear on restore.
 * Backed by `DELETE /events/:id/hide`.
 */
export async function hideEvent(
  id: string
): Promise<{ data: Event | null; error: ApiError | null }> {
  return apiCall<Event>(backendClient.delete(`/events/${id}/hide`));
}

/**
 * Bring a hidden event back.
 * Backed by `PATCH /events/:id/restore`.
 */
export async function restoreEvent(
  id: string
): Promise<{ data: Event | null; error: ApiError | null }> {
  return apiCall<Event>(backendClient.patch(`/events/${id}/restore`));
}

/**
 * Permanently delete a draft or cancelled event. Irreversible, and refused for
 * a completed event — that record has to be kept, so hide it instead.
 * Backed by `DELETE /events/:id`.
 */
export async function deleteEvent(
  id: string
): Promise<{ data: { message: string } | null; error: ApiError | null }> {
  return apiCall<{ message: string }>(backendClient.delete(`/events/${id}`));
}

/**
 * Upload event cover image.
 * Backed by `POST /events/:id/cover`.
 */
export async function uploadEventCover(
  id: string,
  file: File
): Promise<{ data: { coverImageUrl: string } | null; error: ApiError | null }> {
  const formData = new FormData();
  formData.append("file", file);
  return apiCall<{ coverImageUrl: string }>(
    backendClient.post(`/events/${id}/cover`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  );
}

/**
 * Create a ticket type.
 * Backed by `POST /events/:id/ticket-types`.
 */
export interface TicketTypePayload {
  name: string;
  description?: string;
  price: number;
  currency?: string;
  kind?: TicketKind;
  groupPricingMode?: GroupPricingMode;
  minGroupSize?: number;
  maxGroupSize?: number;
  /** Omit for unlimited capacity. */
  totalQuantity?: number;
  /** ISO string sets/moves the on-sale start; `null` clears it; omit = no change. */
  saleStartsAt?: string | null;
  /** ISO string sets/moves the on-sale end; `null` clears it; omit = no change. */
  saleEndsAt?: string | null;
  perUserLimit?: number;
  /**
   * Ids of other ticket types this ticket blocks. When provided on update it
   * replaces the existing set. Directional — the reverse is not implied.
   */
  blocksTicketTypeIds?: string[];
  /**
   * Queue buyers once this ticket sells out instead of turning them away.
   * Rejected by the API unless `totalQuantity` is also set.
   */
  waitlistEnabled?: boolean;
  /** Hours to pay before a held seat is released. Defaults to 24. */
  waitlistOfferTtlHours?: number;
  /**
   * Per-ticket-type WhatsApp group invite link. Overrides the event group for
   * holders of this ticket. Empty string clears it; validated server-side.
   */
  whatsappGroupUrl?: string;
}

export async function createTicketType(
  eventId: string,
  payload: TicketTypePayload
): Promise<{ data: EventTicketType | null; error: ApiError | null }> {
  return apiCall<EventTicketType>(
    backendClient.post(`/events/${eventId}/ticket-types`, payload)
  );
}

/**
 * Update a ticket type.
 * Backed by `PATCH /events/:id/ticket-types/:typeId`.
 */
export async function updateTicketType(
  eventId: string,
  typeId: string,
  payload: Omit<Partial<TicketTypePayload>, "description" | "totalQuantity"> & {
    /** null clears it. */
    description?: string | null;
    /** null = unlimited. */
    totalQuantity?: number | null;
    isVisible?: boolean;
    isActive?: boolean;
  }
): Promise<{ data: EventTicketType | null; error: ApiError | null }> {
  return apiCall<EventTicketType>(
    backendClient.patch(`/events/${eventId}/ticket-types/${typeId}`, payload)
  );
}

/**
 * Delete a ticket type.
 * Backed by `DELETE /events/:id/ticket-types/:typeId`.
 */
/** Per-tier numbers from the operator ticket view. */
export interface TicketTypeStats {
  /** Confirmed, non-cancelled, non-waitlisted registrations. */
  registrations: number;
  checkedIn: number;
  waitlistWaiting: number;
  waitlistOffered: number;
  /** Net of the processing fee; null when the viewer can't see money. */
  revenue: number | null;
}

export type ManagedTicketType = EventTicketType & { stats: TicketTypeStats };

/** Every ticket type incl. hidden/paused, with stats. Operators only. */
export async function getManageTicketTypes(
  eventId: string
): Promise<{ data: ManagedTicketType[] | null; error: ApiError | null }> {
  return apiCall<ManagedTicketType[]>(
    backendClient.get(`/events/${eventId}/ticket-types/manage`)
  );
}

/** Persist display order: pass every ticket type id, in the new order. */
export async function reorderTicketTypes(
  eventId: string,
  ids: string[]
): Promise<{ data: { ok: boolean } | null; error: ApiError | null }> {
  return apiCall<{ ok: boolean }>(
    backendClient.patch(`/events/${eventId}/ticket-types/reorder`, { ids })
  );
}

export async function deleteTicketType(
  eventId: string,
  typeId: string
): Promise<{ data: { message: string } | null; error: ApiError | null }> {
  return apiCall<{ message: string }>(
    backendClient.delete(`/events/${eventId}/ticket-types/${typeId}`)
  );
}

// --- Custom form fields (registration form) --------------------------------

export type FormFieldType =
  | "TEXT"
  | "TEXTAREA"
  | "SELECT"
  | "RADIO"
  | "CHECKBOX"
  | "NUMBER"
  | "EMAIL"
  | "PHONE"
  | "DATE"
  | "URL"
  | "YES_NO"
  | "FILE"
  | "SECTION"
  | "STATE"
  | "RATING";

/** Answer limits per type; see lib/form-questions.ts (FormFieldConfig). */
export type FormFieldConfigPayload = import("@/lib/form-questions").FormFieldConfig;

export interface EventFormField {
  id: string;
  /** Ticket type this field belongs to; null/absent = event-wide (legacy). */
  ticketTypeId?: string | null;
  label: string;
  type: FormFieldType;
  options: string[];
  isRequired: boolean;
  /** Group tickets only: ask once for the team (true) vs every member (false). */
  perGroup: boolean;
  order: number;
  /** Shown under the question (a SECTION's note). */
  helpText?: string | null;
  config?: FormFieldConfigPayload | null;
  /** Show only when an earlier choice question is answered with one of `anyOf`. */
  showIf?: { fieldId: string; anyOf: string[] } | null;
}

/** Fields the editor may set on a question (create and update). */
interface FormFieldExtras {
  helpText?: string | null;
  config?: FormFieldConfigPayload | null;
  showIf?: { fieldId: string; anyOf: string[] } | null;
}

/** Add a custom form field. Backed by `POST /events/:id/form-fields`. */
export async function createFormField(
  eventId: string,
  payload: {
    /** Scope the field to a specific ticket type. Omit for event-wide. */
    ticketTypeId?: string;
    label: string;
    type: FormFieldType;
    options?: string[];
    isRequired?: boolean;
    /** Group tickets only: ask once for the team instead of every member. */
    perGroup?: boolean;
    order?: number;
  } & FormFieldExtras
): Promise<{ data: EventFormField | null; error: ApiError | null }> {
  return apiCall<EventFormField>(
    backendClient.post(`/events/${eventId}/form-fields`, payload)
  );
}

/** Update a custom form field. Backed by `PATCH /events/:id/form-fields/:fieldId`. */
export async function updateFormField(
  eventId: string,
  fieldId: string,
  payload: {
    label?: string;
    type?: FormFieldType;
    options?: string[];
    isRequired?: boolean;
    perGroup?: boolean;
    order?: number;
  } & FormFieldExtras
): Promise<{ data: EventFormField | null; error: ApiError | null }> {
  return apiCall<EventFormField>(
    backendClient.patch(`/events/${eventId}/form-fields/${fieldId}`, payload)
  );
}

/** Delete a custom form field. Backed by `DELETE /events/:id/form-fields/:fieldId`. */
export async function deleteFormField(
  eventId: string,
  fieldId: string
): Promise<{ data: unknown; error: ApiError | null }> {
  return apiCall(
    backendClient.delete(`/events/${eventId}/form-fields/${fieldId}`)
  );
}

// --- AI draft (M1) -----------------------------------------------------------

export interface EventDraft {
  description: string;
  /** `day` 1 = the event's first day; times are "HH:MM" in IST when known. */
  agenda: { day: number; start?: string; end?: string; title: string; detail?: string }[];
  faqs: { question: string; answer: string }[];
}

export type EventDraftResult =
  | { ok: true; draft: EventDraft }
  | { ok: false; reason: "disabled" | "capped" | "refused" | "error" | "empty" };

/** Draft description, agenda and FAQs from notes or a link. Saves nothing. `POST /events/:id/ai-draft`. */
export async function draftEventContent(
  eventId: string,
  payload: { notes?: string; url?: string }
): Promise<{ data: EventDraftResult | null; error: ApiError | null }> {
  return apiCall<EventDraftResult>(
    backendClient.post(`/events/${eventId}/ai-draft`, payload)
  );
}

// --- Agenda ----------------------------------------------------------------

export interface AgendaPayload {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  speakerName?: string;
  order?: number;
}

/** Add an agenda item. `POST /events/:id/agenda`. */
export async function createAgenda(
  eventId: string,
  payload: AgendaPayload
): Promise<{ data: EventAgenda | null; error: ApiError | null }> {
  return apiCall<EventAgenda>(
    backendClient.post(`/events/${eventId}/agenda`, payload)
  );
}

/** Update an agenda item. `PATCH /events/:id/agenda/:agendaId`. */
export async function updateAgenda(
  eventId: string,
  agendaId: string,
  payload: Clearing<AgendaPayload>
): Promise<{ data: EventAgenda | null; error: ApiError | null }> {
  return apiCall<EventAgenda>(
    backendClient.patch(`/events/${eventId}/agenda/${agendaId}`, payload)
  );
}

/** Delete an agenda item. `DELETE /events/:id/agenda/:agendaId`. */
export async function deleteAgenda(
  eventId: string,
  agendaId: string
): Promise<{ data: unknown; error: ApiError | null }> {
  return apiCall(backendClient.delete(`/events/${eventId}/agenda/${agendaId}`));
}

// --- Speakers / Guests ------------------------------------------------------

export interface SpeakerPayload {
  name: string;
  bio?: string;
  avatarUrl?: string;
  designation?: string;
  company?: string;
  linkedinUrl?: string;
  order?: number;
}

/** Add a speaker/guest. `POST /events/:id/speakers`. */
export async function createSpeaker(
  eventId: string,
  payload: SpeakerPayload
): Promise<{ data: EventSpeaker | null; error: ApiError | null }> {
  return apiCall<EventSpeaker>(
    backendClient.post(`/events/${eventId}/speakers`, payload)
  );
}

/** Update a speaker/guest. `PATCH /events/:id/speakers/:speakerId`. */
export async function updateSpeaker(
  eventId: string,
  speakerId: string,
  payload: Clearing<SpeakerPayload>
): Promise<{ data: EventSpeaker | null; error: ApiError | null }> {
  return apiCall<EventSpeaker>(
    backendClient.patch(`/events/${eventId}/speakers/${speakerId}`, payload)
  );
}

/** Delete a speaker/guest. `DELETE /events/:id/speakers/:speakerId`. */
export async function deleteSpeaker(
  eventId: string,
  speakerId: string
): Promise<{ data: unknown; error: ApiError | null }> {
  return apiCall(
    backendClient.delete(`/events/${eventId}/speakers/${speakerId}`)
  );
}

// --- Prizes / Takeaways -----------------------------------------------------

export interface PrizePayload {
  title: string;
  description?: string;
  rank?: string;
  value?: string;
  order?: number;
}

/** Add a prize/takeaway. `POST /events/:id/prizes`. */
export async function createPrize(
  eventId: string,
  payload: PrizePayload
): Promise<{ data: EventPrize | null; error: ApiError | null }> {
  return apiCall<EventPrize>(
    backendClient.post(`/events/${eventId}/prizes`, payload)
  );
}

/** Update a prize/takeaway. `PATCH /events/:id/prizes/:prizeId`. */
export async function updatePrize(
  eventId: string,
  prizeId: string,
  payload: Clearing<PrizePayload>
): Promise<{ data: EventPrize | null; error: ApiError | null }> {
  return apiCall<EventPrize>(
    backendClient.patch(`/events/${eventId}/prizes/${prizeId}`, payload)
  );
}

/** Delete a prize/takeaway. `DELETE /events/:id/prizes/:prizeId`. */
export async function deletePrize(
  eventId: string,
  prizeId: string
): Promise<{ data: unknown; error: ApiError | null }> {
  return apiCall(backendClient.delete(`/events/${eventId}/prizes/${prizeId}`));
}

// --- Contacts ---------------------------------------------------------------

export interface ContactPayload {
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  order?: number;
}

/** Add a contact. `POST /events/:id/contacts`. */
export async function createContact(
  eventId: string,
  payload: ContactPayload
): Promise<{ data: EventContact | null; error: ApiError | null }> {
  return apiCall<EventContact>(
    backendClient.post(`/events/${eventId}/contacts`, payload)
  );
}

/** Update a contact. `PATCH /events/:id/contacts/:contactId`. */
export async function updateContact(
  eventId: string,
  contactId: string,
  payload: Clearing<ContactPayload>
): Promise<{ data: EventContact | null; error: ApiError | null }> {
  return apiCall<EventContact>(
    backendClient.patch(`/events/${eventId}/contacts/${contactId}`, payload)
  );
}

/** Delete a contact. `DELETE /events/:id/contacts/:contactId`. */
export async function deleteContact(
  eventId: string,
  contactId: string
): Promise<{ data: unknown; error: ApiError | null }> {
  return apiCall(
    backendClient.delete(`/events/${eventId}/contacts/${contactId}`)
  );
}

// --- FAQs -------------------------------------------------------------------

export interface FaqPayload {
  question: string;
  answer: string;
  order?: number;
}

/** Add an FAQ. `POST /events/:id/faqs`. */
export async function createFaq(
  eventId: string,
  payload: FaqPayload
): Promise<{ data: EventFaq | null; error: ApiError | null }> {
  return apiCall<EventFaq>(
    backendClient.post(`/events/${eventId}/faqs`, payload)
  );
}

/** Update an FAQ. `PATCH /events/:id/faqs/:faqId`. */
export async function updateFaq(
  eventId: string,
  faqId: string,
  payload: Partial<FaqPayload>
): Promise<{ data: EventFaq | null; error: ApiError | null }> {
  return apiCall<EventFaq>(
    backendClient.patch(`/events/${eventId}/faqs/${faqId}`, payload)
  );
}

/** Delete an FAQ. `DELETE /events/:id/faqs/:faqId`. */
export async function deleteFaq(
  eventId: string,
  faqId: string
): Promise<{ data: unknown; error: ApiError | null }> {
  return apiCall(backendClient.delete(`/events/${eventId}/faqs/${faqId}`));
}

// --- Co-hosting -------------------------------------------------------------

export interface CoHostSpace {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

export interface CoHostEntry {
  id: string;
  createdAt: string;
  space: CoHostSpace;
}

/** A pending offer to hand the event to a co-host. `null` when none is open. */
export interface PendingTransfer {
  id: string;
  status: string;
  reason: string | null;
  createdAt: string;
  fromSpace: CoHostSpace;
  toSpace: CoHostSpace;
}

export interface CoHostsResponse {
  owner: CoHostSpace;
  coHosts: CoHostEntry[];
  pendingTransfer: PendingTransfer | null;
}

/** List the host + co-host spaces for an event. `GET /events/:id/co-hosts`. */
export async function getCoHosts(
  eventId: string
): Promise<{ data: CoHostsResponse | null; error: ApiError | null }> {
  return apiCall<CoHostsResponse>(
    backendClient.get(`/events/${eventId}/co-hosts`)
  );
}

/** Offer ownership to a co-host. `POST /events/:id/co-hosts/transfer`. */
export async function requestOwnershipTransfer(
  eventId: string,
  toSpaceId: string,
  reason?: string
): Promise<{ data: PendingTransfer | null; error: ApiError | null }> {
  return apiCall<PendingTransfer>(
    backendClient.post(`/events/${eventId}/co-hosts/transfer`, {
      toSpaceId,
      reason,
    })
  );
}

/** Accept a pending transfer. `POST /events/:id/co-hosts/transfer/accept`. */
export async function acceptOwnershipTransfer(
  eventId: string,
  reviewNote?: string
): Promise<{ data: { success: boolean } | null; error: ApiError | null }> {
  return apiCall(
    backendClient.post(`/events/${eventId}/co-hosts/transfer/accept`, {
      reviewNote,
    })
  );
}

/** Decline a pending transfer. `POST /events/:id/co-hosts/transfer/decline`. */
export async function declineOwnershipTransfer(
  eventId: string,
  reviewNote?: string
): Promise<{ data: { success: boolean } | null; error: ApiError | null }> {
  return apiCall(
    backendClient.post(`/events/${eventId}/co-hosts/transfer/decline`, {
      reviewNote,
    })
  );
}

/** Host rescinds a pending transfer. `DELETE /events/:id/co-hosts/transfer`. */
export async function cancelOwnershipTransfer(
  eventId: string
): Promise<{ data: { success: boolean } | null; error: ApiError | null }> {
  return apiCall(
    backendClient.delete(`/events/${eventId}/co-hosts/transfer`)
  );
}

/** Invite a space to co-host. `POST /events/:id/co-hosts`. */
export async function addCoHost(
  eventId: string,
  spaceId: string
): Promise<{ data: { success: boolean } | null; error: ApiError | null }> {
  return apiCall(
    backendClient.post(`/events/${eventId}/co-hosts`, { spaceId })
  );
}

/** Remove a co-host space. `DELETE /events/:id/co-hosts/:spaceId`. */
export async function removeCoHost(
  eventId: string,
  spaceId: string
): Promise<{ data: { success: boolean } | null; error: ApiError | null }> {
  return apiCall(
    backendClient.delete(`/events/${eventId}/co-hosts/${spaceId}`)
  );
}

// --- Event team -------------------------------------------------------------

export interface TeamUser {
  id: string;
  fullName: string | null;
  username: string | null;
  avatarUrl: string | null;
}

export interface TeamMember {
  userRoleId: string;
  userId: string;
  user: TeamUser;
  role: { code: string; name: string } | null;
}

/** List the event team. `GET /events/:id/team`. */
export async function getEventTeam(
  eventId: string
): Promise<{ data: { members: TeamMember[] } | null; error: ApiError | null }> {
  return apiCall(backendClient.get(`/events/${eventId}/team`));
}

/** Search space members to add to the team. `GET /events/:id/team/search`. */
export async function searchTeamCandidates(
  eventId: string,
  q: string
): Promise<{ data: { results: TeamUser[] } | null; error: ApiError | null }> {
  return apiCall(
    backendClient.get(`/events/${eventId}/team/search`, { params: { q } })
  );
}

/**
 * The event-scoped roles a Space Admin / Curator can hand out. Mirrors the
 * backend `EventTeamRole`.
 */
export type EventTeamRole = "CURATOR" | "CO_CURATOR" | "CREW";

/** Add or re-assign a team member's role. `POST /events/:id/team`. */
export async function addTeamMember(
  eventId: string,
  userId: string,
  roleCode: EventTeamRole = "CREW"
): Promise<{ data: { success: boolean } | null; error: ApiError | null }> {
  return apiCall(
    backendClient.post(`/events/${eventId}/team`, { userId, roleCode })
  );
}

/** Remove a team member. `DELETE /events/:id/team/:userId`. */
export async function removeTeamMember(
  eventId: string,
  userId: string
): Promise<{ data: { success: boolean } | null; error: ApiError | null }> {
  return apiCall(backendClient.delete(`/events/${eventId}/team/${userId}`));
}

// --- Sub-events (a "big event" grouping several sub-events) ------------------

/**
 * List all sub-events of a parent, including drafts (organiser view).
 * `GET /events/:id/sub-events/manage`.
 */
export async function getManagedSubEvents(
  parentId: string
): Promise<{ data: SubEvent[] | null; error: ApiError | null }> {
  return apiCall<SubEvent[]>(
    backendClient.get(`/events/${parentId}/sub-events/manage`)
  );
}

/**
 * List the published sub-events of a parent (public hub).
 * `GET /events/:id/sub-events`.
 */
export async function getSubEvents(
  parentId: string
): Promise<{ data: SubEvent[] | null; error: ApiError | null }> {
  return apiCall<SubEvent[]>(
    backendClient.get(`/events/${parentId}/sub-events`)
  );
}

/**
 * Attach an existing event as a sub-event of a parent.
 * `POST /events/:parentId/sub-events`.
 */
export async function attachSubEvent(
  parentId: string,
  eventId: string
): Promise<{ data: SubEvent | null; error: ApiError | null }> {
  return apiCall<SubEvent>(
    backendClient.post(`/events/${parentId}/sub-events`, { eventId })
  );
}

/**
 * Detach a sub-event, making it a standalone event again.
 * `DELETE /events/:parentId/sub-events/:childId`.
 */
export async function detachSubEvent(
  parentId: string,
  childId: string
): Promise<{ data: SubEvent | null; error: ApiError | null }> {
  return apiCall<SubEvent>(
    backendClient.delete(`/events/${parentId}/sub-events/${childId}`)
  );
}

// --- Cross-space sub-event attach requests ----------------------------------

/** A slim event card carried on an attach request (parent and child sides). */
export interface AttachRequestEvent {
  id: string;
  title: string;
  slug: string;
  coverImageUrl?: string | null;
  startDateTime: string;
  status: EventStatus;
  space: CoHostSpace;
}

/**
 * A pending request to nest a co-host's event under a parent "big event". The
 * child's owning space must approve before the nesting happens.
 */
export interface SubEventAttachRequest {
  id: string;
  status: string;
  reason: string | null;
  createdAt: string;
  parentEvent: AttachRequestEvent;
  childEvent: AttachRequestEvent;
  requester: {
    id: string;
    fullName: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
}

export interface SubEventAttachRequests {
  /** Others asking to nest THIS event under their parent — accept or decline. */
  incoming: SubEventAttachRequest[];
  /** THIS event (a parent) asking to pull another space's event in — rescind. */
  outgoing: SubEventAttachRequest[];
}

/**
 * Pending attach requests concerning an event, both directions.
 * `GET /events/:id/sub-events/requests`.
 */
export async function getSubEventAttachRequests(
  eventId: string
): Promise<{ data: SubEventAttachRequests | null; error: ApiError | null }> {
  return apiCall<SubEventAttachRequests>(
    backendClient.get(`/events/${eventId}/sub-events/requests`)
  );
}

/**
 * Ask a co-host's space to nest its event under this parent.
 * `POST /events/:parentId/sub-events/requests`.
 */
export async function requestSubEventAttach(
  parentId: string,
  eventId: string,
  reason?: string
): Promise<{ data: SubEventAttachRequest | null; error: ApiError | null }> {
  return apiCall<SubEventAttachRequest>(
    backendClient.post(`/events/${parentId}/sub-events/requests`, {
      eventId,
      reason,
    })
  );
}

/**
 * Accept a request to nest this event (owning space only).
 * `POST /events/:id/sub-events/requests/:requestId/accept`.
 */
export async function acceptSubEventAttach(
  eventId: string,
  requestId: string,
  reviewNote?: string
): Promise<{ data: SubEvent | null; error: ApiError | null }> {
  return apiCall<SubEvent>(
    backendClient.post(
      `/events/${eventId}/sub-events/requests/${requestId}/accept`,
      { reviewNote }
    )
  );
}

/**
 * Decline a request to nest this event (owning space only).
 * `POST /events/:id/sub-events/requests/:requestId/decline`.
 */
export async function declineSubEventAttach(
  eventId: string,
  requestId: string,
  reviewNote?: string
): Promise<{ data: { success: boolean } | null; error: ApiError | null }> {
  return apiCall(
    backendClient.post(
      `/events/${eventId}/sub-events/requests/${requestId}/decline`,
      { reviewNote }
    )
  );
}

/**
 * Rescind a pending attach request (requesting side).
 * `DELETE /events/:id/sub-events/requests/:requestId`.
 */
export async function cancelSubEventAttach(
  eventId: string,
  requestId: string
): Promise<{ data: { success: boolean } | null; error: ApiError | null }> {
  return apiCall(
    backendClient.delete(
      `/events/${eventId}/sub-events/requests/${requestId}`
    )
  );
}

/**
 * Upload a file answer for a FILE question. Stored privately; the returned
 * object is the answer to send with the registration.
 * Backed by `POST /events/:id/form-fields/:fieldId/upload`.
 */
export async function uploadFormFieldFile(
  eventId: string,
  fieldId: string,
  file: File
): Promise<{
  data: import("@/lib/form-questions").FileAnswer | null;
  error: ApiError | null;
}> {
  const formData = new FormData();
  formData.append("file", file);
  return apiCall(
    backendClient.post(`/events/${eventId}/form-fields/${fieldId}/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  );
}

/**
 * A 5-minute link to an attendee's uploaded file.
 * Backed by `GET /events/:id/form-uploads/url`.
 */
export async function getFormUploadUrl(
  eventId: string,
  key: string
): Promise<{ data: { url: string } | null; error: ApiError | null }> {
  return apiCall<{ url: string }>(
    backendClient.get(`/events/${eventId}/form-uploads/url`, { params: { key } })
  );
}
