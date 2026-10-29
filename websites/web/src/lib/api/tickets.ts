import { call } from "@/lib/api/registration";

/*
 * My tickets on the web: the app's Tickets tab and ticket page, on the same
 * endpoints. A registration comes back with its event, ticket type and codes.
 */

export interface Ticket {
  /** The registration id: what every ticket action takes. */
  id: string;
  status: string;
  paymentStatus: string;
  /** Rupees, as a decimal string. What was charged (0 after a 100% coupon). */
  totalAmount: string | number | null;
  qrCode: string | null;
  checkedInAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  groupSize: number | null;
  ticketType: { id: string; name: string; price: string | number } | null;
  tickets?: { ticketCode: string | null }[];
  event: {
    id: string;
    title: string;
    slug: string;
    coverImageUrl: string | null;
    startDateTime: string;
    endDateTime: string | null;
    venueName: string | null;
    city: string | null;
    type: string;
    status: string;
    space: { name: string; slug: string; logoUrl: string | null } | null;
  };
  /** A seat in someone else's group booking: read-only, the lead manages it. */
  isGroupMember?: boolean;
  leadName?: string | null;
}

const PAGE = 50;

/** Own tickets: live (paid or free, not cancelled) or cancelled ones I haven't deleted. */
export const listMyTickets = (token: string, scope: "active" | "cancelled", page = 1) =>
  call<{ data: Ticket[] }>("GET", `/users/me/registrations?page=${page}&limit=${PAGE}&scope=${scope}`, undefined, token).then((r) => r.data);
/** Seats in other people's group bookings that carry my email. */
export const listMemberTickets = (token: string) =>
  call<{ data: Ticket[] }>("GET", "/users/me/member-tickets", undefined, token).then((r) =>
    (r.data ?? []).map((t) => ({ ...t, isGroupMember: true })),
  );

let seen: Ticket[] = [];

/**
 * Everything My tickets lists: own live tickets plus group seats, and
 * cancelled ones. Remembered, so a ticket page opened from the list
 * doesn't fetch it all again.
 */
export async function loadTickets(token: string) {
  const [live, member, cancelled] = await Promise.all([
    listMyTickets(token, "active"),
    listMemberTickets(token).catch(() => [] as Ticket[]),
    listMyTickets(token, "cancelled"),
  ]);
  seen = [...live, ...member, ...cancelled];
  return { live: [...member, ...live], cancelled };
}

/** One of my tickets by registration id, from the list. null when it isn't mine (or was deleted). */
export async function findTicket(token: string, id: string): Promise<Ticket | null> {
  const hit = seen.find((t) => t.id === id);
  if (hit) return hit;
  await loadTickets(token);
  return seen.find((t) => t.id === id) ?? null;
}

/** Over by the clock (3 hours when there's no end time) or marked completed / cancelled. As the app decides it. */
export function isOver(t: Ticket, now: number) {
  if (t.event.status === "COMPLETED" || t.event.status === "CANCELLED") return true;
  const start = new Date(t.event.startDateTime).getTime();
  const end = t.event.endDateTime ? new Date(t.event.endDateTime).getTime() : start + 3 * 60 * 60 * 1000;
  return (Number.isNaN(end) ? start + 3 * 60 * 60 * 1000 : end) <= now;
}

/** What was charged, else the list price. 0 = free. */
export const charged = (t: Ticket) => Number(t.totalAmount ?? t.ticketType?.price ?? 0) || 0;

/** Free tickets only; paid ones go through a refund request. */
export const cancelTicket = (token: string, id: string, reason?: string) =>
  call("POST", `/registrations/${id}/cancel`, reason ? { reason } : {}, token);
/** Takes a finished ticket off my list. The registration stays for the organiser. */
export const deleteTicket = (token: string, id: string) => call("DELETE", `/users/me/registrations/${id}`, undefined, token);

export interface Checkin {
  id: string;
  checkedInAt: string;
  /** The check-in point ("Main entrance", "Day 2"), when the organiser named it. */
  checkinType: string | null;
  checkedBy: string | null;
}
export const getCheckins = (token: string, id: string) => call<Checkin[]>("GET", `/registrations/${id}/checkins`, undefined, token);

export interface WhatsappGroup {
  inviteUrl: string | null;
  isCommunity: boolean;
  joined: boolean;
}
export const getWhatsappGroup = (token: string, id: string) =>
  call<WhatsappGroup | null>("GET", `/registrations/${id}/whatsapp-group`, undefined, token);
/** Marking it joined stops the organiser's invite reminders for this ticket. */
export const setWhatsappJoined = (token: string, id: string, joined: boolean) =>
  call("PATCH", `/registrations/${id}/whatsapp-joined`, { joined }, token);

export type RefundStatus = "PENDING_CURATOR" | "PENDING_ADMIN" | "PROCESSING" | "APPROVED" | "REJECTED";
export const OPEN_REFUND: RefundStatus[] = ["PENDING_CURATOR", "PENDING_ADMIN", "PROCESSING"];
export interface Refund {
  id: string;
  status: RefundStatus;
  reason: string;
  requestedAmount: string | number | null;
  approvedAmount: string | number | null;
  curatorNote: string | null;
  curatorActionAt: string | null;
  adminNote: string | null;
  adminActionAt: string | null;
  createdAt: string;
  registration?: { id: string } | null;
}
/** My refund requests for one ticket, newest first. */
export const getRefunds = (token: string, registrationId: string) =>
  call<{ requests: Refund[] }>("GET", "/refunds/my?limit=50", undefined, token).then((r) =>
    (r.requests ?? []).filter((q) => q.registration?.id === registrationId),
  );
export const requestRefund = (token: string, registrationId: string, reason: string) =>
  call("POST", "/refunds", { registrationId, reason }, token);

export const REPORT_REASONS = [
  { key: "payment_issue", label: "Payment problem" },
  { key: "ticket_not_working", label: "Ticket or QR not working" },
  { key: "wrong_details", label: "Wrong details on my ticket" },
  { key: "event_changed_or_cancelled", label: "Event changed or was cancelled" },
  { key: "refund_issue", label: "Refund problem" },
  { key: "other", label: "Something else" },
] as const;
/** Re-reporting the same ticket updates the open report. */
export const reportTicket = (token: string, id: string, reason: string, details?: string) =>
  call<{ alreadyReported: boolean }>("POST", "/content-reports", { targetType: "REGISTRATION", targetId: id, reason, details }, token);

export interface WaitlistEntry {
  registrationId: string;
  event: { id: string; title: string; slug: string; startDateTime: string; venueName: string | null; city: string | null };
  ticketType: { name: string } | null;
  waitlistStatus: "WAITING" | "OFFERED" | string;
  /** Place in the queue; null once a spot is offered. */
  position: number | null;
  offer: { expiresAt: string | null; amountDue: number; needsPayment: boolean } | null;
}
export const getWaitlist = (token: string) => call<WaitlistEntry[]>("GET", "/users/me/waitlist", undefined, token);
/** Leave the queue, or turn down an offered spot. */
export const leaveWaitlist = (token: string, registrationId: string) =>
  call("DELETE", `/registrations/${registrationId}/waitlist`, undefined, token);
/** The Razorpay order for an offered spot; confirm through the normal verifyPayment. */
export const payWaitlistOffer = (token: string, registrationId: string) =>
  call<{ razorpayOrderId: string; razorpayKeyId: string; amount: number; currency: string }>(
    "POST",
    `/registrations/${registrationId}/waitlist/pay`,
    undefined,
    token,
  );
