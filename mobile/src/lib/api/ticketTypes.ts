import { call } from './manageEvent';
import type { FormFieldConfig } from '../../utils/formQuestions';

export type TicketKind = 'INDIVIDUAL' | 'GROUP' | 'RSVP';
export type GroupPricingMode = 'PER_GROUP' | 'PER_PERSON';

/** Per-tier numbers from the operator ticket view. */
export interface TicketTypeStats {
  /** Confirmed, non-cancelled, non-waitlisted bookings. */
  registrations: number;
  checkedIn: number;
  waitlistWaiting: number;
  waitlistOffered: number;
  /** Net of the processing fee; null when the viewer can't see money. */
  revenue: number | null;
}

/** A ticket type as the event endpoint returns it (price is a Decimal → string). */
export interface ManagedTicketType {
  id: string;
  name: string;
  description?: string | null;
  price: number | string;
  currency: string;
  kind: TicketKind;
  groupPricingMode?: GroupPricingMode | null;
  minGroupSize?: number | null;
  maxGroupSize?: number | null;
  /** null = unlimited. */
  totalQuantity: number | null;
  soldCount: number;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
  perUserLimit: number;
  waitlistEnabled: boolean;
  waitlistOfferTtlHours: number;
  order: number;
  isVisible: boolean;
  isActive: boolean;
  whatsappGroupUrl?: string | null;
  /** Ticket types this one blocks: its holders can't register for them. */
  blocks?: { blockedId: string }[];
  /** Only on the operator endpoint. */
  stats?: TicketTypeStats;
}

/**
 * Body for create/update. On update, `null` sale dates clear the bound while
 * leaving them out keeps whatever is stored.
 */
export interface TicketTypePayload {
  name: string;
  description?: string;
  kind: TicketKind;
  price: number;
  totalQuantity?: number;
  perUserLimit?: number;
  waitlistEnabled?: boolean;
  waitlistOfferTtlHours?: number;
  groupPricingMode?: GroupPricingMode;
  minGroupSize?: number;
  maxGroupSize?: number;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
  isVisible?: boolean;
  isActive?: boolean;
  /** "" clears it; the event group applies again. */
  whatsappGroupUrl?: string;
  blocksTicketTypeIds?: string[];
}

/** POST /events/:id/ticket-types — needs event:edit (Curator, Co-Curator, Space Admin). */
export const createTicketType = (eventId: string, body: TicketTypePayload) =>
  call<ManagedTicketType>(`/events/${eventId}/ticket-types`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** PATCH /events/:id/ticket-types/:typeId */
export const updateTicketType = (eventId: string, typeId: string, body: Partial<TicketTypePayload>) =>
  call<ManagedTicketType>(`/events/${eventId}/ticket-types/${typeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** DELETE /events/:id/ticket-types/:typeId — the server refuses if it can't be removed safely. */
export const deleteTicketType = (eventId: string, typeId: string) =>
  call<unknown>(`/events/${eventId}/ticket-types/${typeId}`, { method: 'DELETE' });

/**
 * GET /events/:id/ticket-types/manage — every tier incl. hidden ones, with
 * stats. The public event payload drops hidden tiers, so it can't be used to
 * manage them.
 */
export const getManageTicketTypes = (eventId: string) =>
  call<ManagedTicketType[]>(`/events/${eventId}/ticket-types/manage`);

/** PATCH /events/:id/ticket-types/reorder — every id of the event, in the new order. */
export const reorderTicketTypes = (eventId: string, ids: string[]) =>
  call<{ ok: boolean }>(`/events/${eventId}/ticket-types/reorder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });

/**
 * Hidden and paused mean the same to a buyer (the backend refuses either), so
 * the app treats them as one "off sale" state and flips both together.
 */
export const isOffSale = (t: Pick<ManagedTicketType, 'isVisible' | 'isActive'>) =>
  t.isVisible === false || t.isActive === false;

export type SaleStatus = 'off-sale' | 'sold-out' | 'ended' | 'scheduled' | 'on-sale';

/** What a buyer sees right now. The first reason it can't be bought wins. */
export function saleStatus(t: ManagedTicketType, now = new Date()): SaleStatus {
  if (isOffSale(t)) return 'off-sale';
  if (t.totalQuantity != null && t.soldCount >= t.totalQuantity) return 'sold-out';
  if (t.saleEndsAt && new Date(t.saleEndsAt) <= now) return 'ended';
  if (t.saleStartsAt && new Date(t.saleStartsAt) > now) return 'scheduled';
  return 'on-sale';
}

export const SALE_STATUS_LABEL: Record<SaleStatus, { label: string; tone: 'neutral' | 'accent' | 'success' | 'warning' }> = {
  'on-sale': { label: 'On sale', tone: 'success' },
  scheduled: { label: 'Scheduled', tone: 'accent' },
  'sold-out': { label: 'Sold out', tone: 'warning' },
  ended: { label: 'Sales ended', tone: 'neutral' },
  'off-sale': { label: 'Hidden', tone: 'neutral' },
};

// ── Registration questions (per-ticket custom form) ─────────────────────────

export type FormFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'SELECT'
  | 'RADIO'
  | 'CHECKBOX'
  | 'NUMBER'
  | 'EMAIL'
  | 'PHONE'
  | 'DATE'
  | 'URL'
  | 'YES_NO'
  | 'FILE'
  | 'SECTION'
  | 'STATE'
  | 'RATING';

/** Show only when an earlier choice question is answered with one of `anyOf`. */
export interface FormShowIf {
  fieldId: string;
  anyOf: string[];
}

export interface TicketFormField {
  id: string;
  ticketTypeId: string | null;
  label: string;
  type: FormFieldType;
  options: string[];
  isRequired: boolean;
  order: number;
  /** Group tickets: asked once for the whole group instead of every member. */
  perGroup: boolean;
  helpText?: string | null;
  config?: FormFieldConfig | null;
  showIf?: FormShowIf | null;
}

export interface FormFieldPayload {
  ticketTypeId?: string;
  label: string;
  type: FormFieldType;
  options: string[];
  isRequired: boolean;
  perGroup?: boolean;
  order?: number;
  helpText?: string | null;
  config?: FormFieldConfig | null;
  showIf?: FormShowIf | null;
}

export const FIELD_TYPES: { key: FormFieldType; label: string }[] = [
  { key: 'TEXT', label: 'Short text' },
  { key: 'TEXTAREA', label: 'Paragraph' },
  { key: 'NUMBER', label: 'Number' },
  { key: 'EMAIL', label: 'Email' },
  { key: 'PHONE', label: 'Phone' },
  { key: 'SELECT', label: 'Dropdown' },
  { key: 'RADIO', label: 'Single choice' },
  { key: 'CHECKBOX', label: 'Checkboxes' },
  { key: 'URL', label: 'Link' },
  { key: 'DATE', label: 'Date' },
  { key: 'YES_NO', label: 'Yes / No tick' },
  { key: 'STATE', label: 'State / UT' },
  { key: 'RATING', label: 'Rating' },
  { key: 'FILE', label: 'File upload' },
  { key: 'SECTION', label: 'Section heading' },
];

/** Types whose answer can decide whether a later question shows. */
export const CHOICE_TYPES: FormFieldType[] = ['SELECT', 'RADIO', 'CHECKBOX', 'YES_NO', 'STATE'];

/** Types that need the organiser to list the choices. */
export const OPTION_TYPES: FormFieldType[] = ['SELECT', 'RADIO', 'CHECKBOX'];

/** Every attendee is always asked these; custom questions come on top. */
export const DEFAULT_FIELDS = ['Name', 'Phone', 'Email', 'Gender'];

/** POST /events/:id/form-fields */
export const createFormField = (eventId: string, body: FormFieldPayload) =>
  call<TicketFormField>(`/events/${eventId}/form-fields`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** PATCH /events/:id/form-fields/:fieldId */
export const updateFormField = (eventId: string, fieldId: string, body: Partial<FormFieldPayload>) =>
  call<TicketFormField>(`/events/${eventId}/form-fields/${fieldId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** DELETE /events/:id/form-fields/:fieldId */
export const deleteFormField = (eventId: string, fieldId: string) =>
  call<unknown>(`/events/${eventId}/form-fields/${fieldId}`, { method: 'DELETE' });
