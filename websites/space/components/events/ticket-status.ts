import type { EventTicketType } from "@/lib/api/events-api";

export type TicketSaleStatus =
  | "off-sale"
  | "sold-out"
  | "ended"
  | "scheduled"
  | "on-sale";

export const SALE_STATUS_META: Record<
  TicketSaleStatus,
  { label: string; variant: "success" | "neutral" | "warning" | "destructive" | "brand" }
> = {
  "on-sale": { label: "On sale", variant: "success" },
  scheduled: { label: "Scheduled", variant: "brand" },
  "sold-out": { label: "Sold out", variant: "warning" },
  ended: { label: "Sales ended", variant: "neutral" },
  "off-sale": { label: "Hidden", variant: "neutral" },
};

/**
 * Hidden and paused are the same thing to a buyer: the backend drops a ticket
 * from the event page and refuses registration when either flag is off.
 */
export function isOffSale(t: Pick<EventTicketType, "isVisible" | "isActive">) {
  return !t.isVisible || !t.isActive;
}

/**
 * What a buyer would see for this ticket right now. Order matters: the first
 * reason a ticket can't be bought wins, so a hidden ticket reads "Hidden" even
 * if it is also sold out.
 */
export function ticketSaleStatus(
  t: EventTicketType,
  now: Date = new Date()
): TicketSaleStatus {
  if (isOffSale(t)) return "off-sale";
  if (t.totalQuantity != null && t.soldCount >= t.totalQuantity) return "sold-out";
  if (t.saleEndsAt && new Date(t.saleEndsAt) <= now) return "ended";
  if (t.saleStartsAt && new Date(t.saleStartsAt) > now) return "scheduled";
  return "on-sale";
}
