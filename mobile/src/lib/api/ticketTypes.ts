import { call } from './manageEvent';

export type TicketKind = 'INDIVIDUAL' | 'GROUP' | 'RSVP';
export type GroupPricingMode = 'PER_GROUP' | 'PER_PERSON';

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
}

/**
 * Body for create/update. Sale dates are deliberately absent: mobile has no
 * date picker yet, and leaving them out of a PATCH keeps whatever the web set.
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
