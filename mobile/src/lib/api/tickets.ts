/**
 * Tickets API Client for Mobile App
 * Handles ticket fetching for event registration (authenticated)
 */

import { makeAuthenticatedRequest, makePublicRequest } from './helpers';
import { API_URL } from '../constants';
import type { FileAnswer, FormFieldConfig } from '../../utils/formQuestions';
import { postMultipart } from './upload';
import { Linking } from 'react-native';
import { AppAlert } from '../../components/ui/AppAlert';

/**
 * App-wide processing fee percentage (admin-set), applied to paid tickets.
 * Public endpoint; returns 0 on any failure so pricing never over-charges.
 */
export async function getProcessingFeePercent(): Promise<number> {
  try {
    const response = await makePublicRequest('/config/processing-fee');
    if (!response?.ok) return 0;
    const data = await response.json();
    return Number(data.processingFeePercent) || 0;
  } catch {
    return 0;
  }
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

export type TicketType = 'individual' | 'group';
export type PriceType = 'per_person' | 'per_group';
export type TicketVisibility = 'public' | 'private' | 'draft';
export type FieldType = 
  | 'text' 
  | 'textarea' 
  | 'email' 
  | 'phone' 
  | 'number' 
  | 'dropdown' 
  | 'multi_select' 
  | 'radio' 
  | 'date' 
  | 'file' 
  | 'checkbox' 
  | 'url' 
  | 'country' 
  | 'id_proof_type' 
  | 'id_proof_upload'
  | 'yes_no'
  | 'state'
  | 'rating'
  | 'section';

export interface Ticket {
  id: string;
  event_id: string;
  name: string;
  description?: string;
  type: TicketType;
  price_type: PriceType;
  price: number;
  currency: string;
  group_size?: number;
  allow_partial_group: boolean;
  require_all_member_details: boolean;
  group_leader_required: boolean;
  quantity_available: number;
  quantity_sold: number;
  min_purchase: number;
  max_purchase: number;
  sales_start?: string;
  sales_end?: string;
  visibility: TicketVisibility;
  display_order: number;
  // Ids of ticket types that block this one: if the user already holds any of
  // them, this ticket is unavailable (organiser-configured restriction).
  blockedByTicketTypeIds: string[];
  /** Queue buyers once this sells out rather than turning them away. */
  waitlist_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomField {
  id: string;
  event_id: string;
  label: string;
  field_type: FieldType;
  placeholder?: string;
  help_text?: string;
  default_value?: string;
  is_required: boolean;
  /** Group tickets only: asked once for the team (true) vs every member (false). */
  per_group?: boolean;
  validation_rules?: Record<string, any>;
  options_json?: Array<{ label: string; value: string }>;
  /** Answer limits (lengths, range, dates, picks, rating scale, files). */
  config?: FormFieldConfig;
  /** Show only when an earlier choice question's answer is one of `any_of`. */
  show_if?: { field_id: string; any_of: string[] } | null;
  applies_to_ticket_ids?: string[];
  display_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch with timeout for React Native
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout: number = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Get tickets for an event (authenticated)
 * Only returns public tickets for published events
 */
/**
 * Map a backend EventTicketType (kind RSVP/INDIVIDUAL/GROUP) to the Ticket
 * shape this app's registration UI expects. RSVP tickets are treated as free
 * individual tickets (one-click). `null` totalQuantity means unlimited.
 */
export function mapBackendTicket(t: any, eventId: string): Ticket {
  const isGroup = t.kind === 'GROUP';
  const minGroup = isGroup ? t.minGroupSize ?? 1 : 1;
  const maxGroup = isGroup ? t.maxGroupSize ?? minGroup : t.perUserLimit ?? 1;
  return {
    id: t.id,
    event_id: eventId,
    name: t.name,
    description: t.description ?? undefined,
    type: isGroup ? 'group' : 'individual',
    // Individual tickets price per person (price × qty). Group tickets follow
    // their configured mode. This mirrors the backend's charge exactly.
    price_type: isGroup
      ? t.groupPricingMode === 'PER_PERSON'
        ? 'per_person'
        : 'per_group'
      : 'per_person',
    price: Number(t.price) || 0,
    currency: t.currency || 'INR',
    // group_size doubles as the minimum people for a group in the UI stepper.
    group_size: isGroup ? minGroup : undefined,
    allow_partial_group: false,
    require_all_member_details: isGroup,
    group_leader_required: isGroup,
    // null capacity = unlimited; expose a large number so availability passes.
    quantity_available: t.totalQuantity ?? 1_000_000,
    quantity_sold: t.soldCount ?? 0,
    // For groups these bound the number of people (min–max group size); for
    // individual tickets they bound the per-user quantity.
    min_purchase: minGroup,
    max_purchase: maxGroup,
    sales_start: t.saleStartsAt ?? undefined,
    sales_end: t.saleEndsAt ?? undefined,
    visibility: t.isVisible && t.isActive ? 'public' : 'private',
    display_order: t.order ?? 0,
    blockedByTicketTypeIds: (t.blockedBy ?? []).map((b: any) => b.blockerId),
    waitlist_enabled: Boolean(t.waitlistEnabled),
    created_at: t.createdAt ?? '',
    updated_at: t.createdAt ?? '',
  };
}

/**
 * Fetch purchasable tickets for an event. Reads the real event detail
 * (`GET /events/:id`) and maps its `ticketTypes` to the Ticket shape.
 */
export async function getEventTickets(eventId: string): Promise<{ tickets: Ticket[] }> {
  try {
    const response = await makeAuthenticatedRequest(`/events/${eventId}`);

    if (!response?.ok) {
      return { tickets: [] };
    }

    const data = await response.json();
    const ticketTypes: any[] = data.ticketTypes || [];

    const tickets = ticketTypes
      .map((t) => mapBackendTicket(t, eventId))
      .filter(
        (ticket) =>
          ticket.visibility === 'public' &&
          // A sold-out ticket is still worth showing when it has a waiting
          // list — that is the only way to reach the queue. Without this it
          // vanishes from the picker and the queue can never be joined.
          (ticket.quantity_available > ticket.quantity_sold ||
            ticket.waitlist_enabled)
      );

    return { tickets };
  } catch (error) {
    if (__DEV__) console.error('Error fetching event tickets:', error);
    return { tickets: [] };
  }
}

/**
 * Get custom fields for an event (authenticated)
 * Returns all custom fields for the event
 */
/** Map a backend FormFieldType (UPPERCASE) to this app's FieldType. */
const FIELD_TYPE_MAP: Record<string, FieldType> = {
  TEXT: 'text',
  TEXTAREA: 'textarea',
  EMAIL: 'email',
  PHONE: 'phone',
  NUMBER: 'number',
  SELECT: 'dropdown',
  RADIO: 'radio',
  CHECKBOX: 'checkbox',
  DATE: 'date',
  URL: 'url',
  YES_NO: 'yes_no',
  FILE: 'file',
  SECTION: 'section',
  STATE: 'state',
  RATING: 'rating',
};

/**
 * Fetch the event's custom registration form. Reads the real event detail
 * (`GET /events/:id`) and maps its `formFields` to CustomField.
 */
export async function getEventCustomFields(eventId: string): Promise<{ fields: CustomField[] }> {
  try {
    const response = await makeAuthenticatedRequest(`/events/${eventId}`);

    if (!response?.ok) {
      return { fields: [] };
    }

    const data = await response.json();
    const formFields: any[] = data.formFields || [];

    const fields: CustomField[] = formFields.map((f) => ({
      id: f.id,
      event_id: eventId,
      label: f.label,
      // Organisers build CHECKBOX as "Checkboxes" (pick any of the options), so
      // with options it's a multi-select; only an option-less one is a yes/no tick.
      field_type:
        f.type === 'CHECKBOX' && f.options?.length
          ? 'multi_select'
          : FIELD_TYPE_MAP[f.type] ?? 'text',
      is_required: !!f.isRequired,
      per_group: !!f.perGroup,
      help_text: f.helpText || undefined,
      config: f.config ?? undefined,
      show_if: f.showIf ? { field_id: f.showIf.fieldId, any_of: f.showIf.anyOf ?? [] } : null,
      options_json: (f.options || []).map((o: string) => ({
        label: o,
        value: o,
      })),
      // A field scoped to a ticket type only applies to that ticket; a field
      // with no ticketTypeId (legacy event-wide) applies to all tickets.
      applies_to_ticket_ids: f.ticketTypeId ? [f.ticketTypeId] : undefined,
      display_order: f.order ?? 0,
      created_at: '',
      updated_at: '',
    }));

    return { fields };
  } catch (error) {
    if (__DEV__) console.error('Error fetching event custom fields:', error);
    return { fields: [] };
  }
}

/**
 * Get custom fields applicable to a specific ticket
 */
export function getFieldsForTicket(fields: CustomField[], ticketId: string): CustomField[] {
  return fields.filter(field => {
    // If applies_to_ticket_ids is null or empty, field applies to all tickets
    if (!field.applies_to_ticket_ids || field.applies_to_ticket_ids.length === 0) {
      return true;
    }
    // Otherwise, check if this ticket is in the list
    return field.applies_to_ticket_ids.includes(ticketId);
  });
}

/**
 * Check if tickets are available for sale
 */
/**
 * True when this ticket is sold out but still takes people onto a waiting
 * list. Selecting it queues the buyer instead of selling them a seat, so the
 * UI must label it differently — nothing is charged at this point.
 */
export function isWaitlistOnly(ticket: Ticket): boolean {
  return (
    ticket.waitlist_enabled && ticket.quantity_sold >= ticket.quantity_available
  );
}

/**
 * True when a seat can be bought right now. A sold-out ticket with a waiting
 * list is deliberately *not* "available": it is selectable, but through
 * `isWaitlistOnly`, so callers never confuse queueing with buying.
 */
export function isTicketAvailable(ticket: Ticket): boolean {
  const now = new Date();

  // Check if sold out
  if (ticket.quantity_sold >= ticket.quantity_available) {
    return false;
  }

  // Check sales period
  if (ticket.sales_start && new Date(ticket.sales_start) > now) {
    return false;
  }
  
  if (ticket.sales_end && new Date(ticket.sales_end) < now) {
    return false;
  }
  
  return true;
}

/**
 * Get the minimum ticket price for an event
 * Returns null if all tickets are free, otherwise returns the lowest price
 */
export function getMinimumTicketPrice(tickets: Ticket[]): { price: number; currency: string } | null {
  if (!tickets || tickets.length === 0) {
    return null;
  }

  // Filter out free tickets and get the minimum price
  const paidTickets = tickets.filter(ticket => ticket.price > 0);
  
  if (paidTickets.length === 0) {
    return null; // All tickets are free
  }

  // Find the ticket with minimum price
  const minTicket = paidTickets.reduce((min, ticket) => 
    ticket.price < min.price ? ticket : min
  );

  return {
    price: minTicket.price,
    currency: minTicket.currency,
  };
}

/**
 * Format price display for events
 * Returns "Free" if all tickets are free, otherwise "Starting from ₹X"
 */
export function formatEventPrice(tickets: Ticket[]): string {
  const minPrice = getMinimumTicketPrice(tickets);
  
  if (!minPrice) {
    return 'Free';
  }

  const currencySymbol = CURRENCY_SYMBOLS[minPrice.currency] || minPrice.currency;
  return `Starting from ${currencySymbol}${minPrice.price}`;
}

/**
 * Calculate ticket price based on quantity
 */
export function calculateTicketPrice(ticket: Ticket, quantity: number): number {
  if (ticket.price_type === 'per_person') {
    return ticket.price * quantity;
  } else {
    // per_group pricing
    return ticket.price;
  }
}

/**
 * Upload a file answer for a FILE question. The backend stores it privately
 * and returns the answer object to send with the registration. Uses the
 * native uploader (see `postMultipart`), since fetch + FormData fails on iOS.
 * Backed by `POST /events/:id/form-fields/:fieldId/upload`.
 */
export async function uploadFormFieldFile(
  eventId: string,
  fieldId: string,
  file: { uri: string; name: string; mimeType?: string | null },
): Promise<FileAnswer> {
  const res = await postMultipart<FileAnswer>(`/events/${eventId}/form-fields/${fieldId}/upload`, {
    field: 'file',
    uri: file.uri,
    name: file.name,
    type: file.mimeType || 'application/octet-stream',
  });
  if (!res.ok) throw new Error(res.message || "Couldn't upload the file.");
  // Keep the name the person picked; the stored key is random.
  return { ...res.data, name: file.name || res.data.name };
}

/** A 5-minute link to an uploaded answer file (uploader or attendee managers). */
export async function getFormUploadUrl(eventId: string, key: string): Promise<string> {
  const response = await makeAuthenticatedRequest(
    `/events/${eventId}/form-uploads/url?key=${encodeURIComponent(key)}`,
  );
  const data = await response?.json().catch(() => null);
  if (!response?.ok || !data?.url) throw new Error(data?.message || "Couldn't open the file.");
  return data.url;
}

/** Open an attendee's uploaded file in the browser through a short-lived link. */
export async function openFormUpload(eventId: string, key: string): Promise<void> {
  try {
    await Linking.openURL(await getFormUploadUrl(eventId, key));
  } catch (e) {
    AppAlert.alert("Couldn't open the file", e instanceof Error ? e.message : undefined);
  }
}
