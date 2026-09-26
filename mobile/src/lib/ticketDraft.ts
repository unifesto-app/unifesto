import { isOffSale, type GroupPricingMode, type ManagedTicketType, type TicketKind, type TicketTypePayload } from './api/ticketTypes';

/** Editable form state. Numbers stay strings so half-typed input survives. */
export interface TicketDraft {
  name: string;
  description: string;
  kind: TicketKind;
  price: string;
  /** Blank = unlimited. */
  capacity: string;
  perUserLimit: string;
  waitlistEnabled: boolean;
  waitlistOfferTtlHours: number;
  groupPricingMode: GroupPricingMode;
  minGroupSize: string;
  maxGroupSize: string;
  /** null = no bound. */
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
  /** Listed and buyable (isVisible && isActive). */
  onSale: boolean;
  whatsappGroupUrl: string;
  /** Ticket types that holders of this one can't register for. */
  blocks: string[];
}

export function emptyDraft(kind: TicketKind): TicketDraft {
  return {
    name: '',
    description: '',
    kind,
    price: kind === 'RSVP' ? '0' : '',
    capacity: '',
    perUserLimit: '1',
    waitlistEnabled: false,
    waitlistOfferTtlHours: 24,
    groupPricingMode: 'PER_GROUP',
    minGroupSize: '2',
    maxGroupSize: '5',
    saleStartsAt: null,
    saleEndsAt: null,
    onSale: true,
    whatsappGroupUrl: '',
    blocks: [],
  };
}

export function toDraft(t: ManagedTicketType): TicketDraft {
  return {
    name: t.name,
    description: t.description ?? '',
    kind: t.kind,
    price: String(Number(t.price) || 0),
    capacity: t.totalQuantity != null ? String(t.totalQuantity) : '',
    perUserLimit: String(t.perUserLimit || 1),
    waitlistEnabled: t.waitlistEnabled,
    waitlistOfferTtlHours: t.waitlistOfferTtlHours || 24,
    groupPricingMode: t.groupPricingMode ?? 'PER_GROUP',
    minGroupSize: String(t.minGroupSize ?? 2),
    maxGroupSize: String(t.maxGroupSize ?? 5),
    saleStartsAt: t.saleStartsAt ? new Date(t.saleStartsAt) : null,
    saleEndsAt: t.saleEndsAt ? new Date(t.saleEndsAt) : null,
    onSale: !isOffSale(t),
    whatsappGroupUrl: t.whatsappGroupUrl ?? '',
    blocks: (t.blocks ?? []).map((b) => b.blockedId).sort(),
  };
}

const whole = (s: string) => /^\d+$/.test(s.trim());

/** First problem with the draft, or null when it can be saved. `original` is the saved type when editing. */
export function validateDraft(d: TicketDraft, original?: ManagedTicketType): string | null {
  const soldCount = original?.soldCount ?? 0;
  if (!d.name.trim()) return d.kind === 'RSVP' ? 'Give the RSVP a name.' : 'Give the ticket a name.';
  // The API ignores a missing capacity on update, so blanking it would silently
  // keep the old cap. Say so instead of pretending it saved.
  if (original?.totalQuantity != null && !d.capacity.trim()) {
    return "A capacity can't be removed once set. Enter a larger number instead.";
  }
  if (d.kind !== 'RSVP' && d.price.trim() && !/^\d+(\.\d{1,2})?$/.test(d.price.trim())) return 'Price must be a number, like 499.';
  if (d.capacity.trim()) {
    if (!whole(d.capacity) || Number(d.capacity) < 1) return 'Capacity must be a whole number, or blank for unlimited.';
    if (Number(d.capacity) < soldCount) return `${soldCount} already booked, so capacity can't go below that.`;
  }
  if (d.kind !== 'RSVP' && (!whole(d.perUserLimit) || Number(d.perUserLimit) < 1)) return 'Limit per person must be at least 1.';
  if (d.kind === 'GROUP') {
    if (!whole(d.minGroupSize) || !whole(d.maxGroupSize)) return 'Group sizes must be whole numbers.';
    const min = Number(d.minGroupSize);
    const max = Number(d.maxGroupSize);
    if (min < 1) return 'Smallest group must be at least 1.';
    if (max < min) return 'Largest group must be at least the smallest group.';
  }
  if (d.saleStartsAt && d.saleEndsAt && d.saleEndsAt <= d.saleStartsAt) return 'Sales must close after they open.';
  const wa = d.whatsappGroupUrl.trim();
  if (wa && !/^https:\/\/chat\.whatsapp\.com\//i.test(wa)) return 'WhatsApp link should start with https://chat.whatsapp.com/';
  return null;
}

/**
 * Request body. On update the waiting-list flag is always sent, because
 * clearing the capacity must switch it off in the same request (the API
 * rejects a waiting list without a capacity).
 */
export function draftToPayload(d: TicketDraft, isEdit: boolean): TicketTypePayload {
  const capacity = d.capacity.trim() ? Number(d.capacity) : undefined;
  // On edit, empty values are sent so clearing a date/link/restriction sticks;
  // on create they're left out.
  const wa = d.whatsappGroupUrl.trim();
  const common: Partial<TicketTypePayload> = {
    saleStartsAt: d.saleStartsAt ? d.saleStartsAt.toISOString() : isEdit ? null : undefined,
    saleEndsAt: d.saleEndsAt ? d.saleEndsAt.toISOString() : isEdit ? null : undefined,
    ...(isEdit || !d.onSale ? { isVisible: d.onSale, isActive: d.onSale } : {}),
    ...(isEdit || wa ? { whatsappGroupUrl: wa } : {}),
    ...(isEdit || d.blocks.length ? { blocksTicketTypeIds: d.blocks } : {}),
  };
  if (d.kind === 'RSVP') {
    return { ...common, name: d.name.trim(), description: d.description.trim() || undefined, kind: 'RSVP', price: 0, totalQuantity: capacity };
  }
  const waitlist = Boolean(capacity && d.waitlistEnabled);
  return {
    ...common,
    name: d.name.trim(),
    description: d.description.trim() || undefined,
    kind: d.kind,
    price: Number(d.price) || 0,
    totalQuantity: capacity,
    perUserLimit: Number(d.perUserLimit) || 1,
    ...(isEdit || waitlist ? { waitlistEnabled: waitlist, waitlistOfferTtlHours: d.waitlistOfferTtlHours } : {}),
    ...(d.kind === 'GROUP'
      ? { groupPricingMode: d.groupPricingMode, minGroupSize: Number(d.minGroupSize), maxGroupSize: Number(d.maxGroupSize) }
      : {}),
  };
}
