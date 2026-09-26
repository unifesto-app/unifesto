/**
 * Admin events API — every event across the platform with organiser, sales and
 * ticket-type info. Backed by `GET /admin/events`.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type AdminEventStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "ONGOING"
  | "COMPLETED"
  | "CANCELLED";

export interface AdminEventTicketType {
  id: string;
  name: string;
  price: string;
  kind: string;
  soldCount: number;
}

export interface AdminEvent {
  id: string;
  title: string;
  slug: string;
  status: AdminEventStatus;
  type: string;
  startDateTime: string;
  endDateTime: string;
  city: string | null;
  category: string | null;
  capacity: number | null;
  registeredCount: number;
  isFree: boolean;
  createdAt: string;
  space: { id: string; name: string; slug: string } | null;
  creator: {
    id: string;
    fullName: string | null;
    username: string | null;
    mobileNumber: string | null;
    email: string | null;
  };
  ticketTypes: AdminEventTicketType[];
  /** Slim parent breadcrumb when this event is a sub-event. */
  parentEvent: { id: string; title: string; slug: string } | null;
  _count: { registrations: number; childEvents: number };
  sales: {
    grossSales: number;
    processingFees: number;
    refunded: number;
    paidRegistrations: number;
  };
}

export interface AdminEventListResponse {
  events: AdminEvent[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/** Ticket type on the detail endpoint — carries per-type paid sales. */
export interface AdminEventDetailTicketType {
  id: string;
  name: string;
  price: string;
  kind: string;
  quantity: number | null;
  soldCount: number;
  sales: { grossSales: number; paidRegistrations: number };
}

/** A slim sub-event row under a "big event". */
export interface AdminEventChild {
  id: string;
  title: string;
  slug: string;
  status: AdminEventStatus;
  startDateTime: string;
  registeredCount: number;
}

/** One of the most-recent registrations shown on the detail page. */
export interface AdminEventRegistration {
  id: string;
  quantity: number;
  totalAmount: string;
  refundedAmount: string;
  paymentStatus: string;
  status: string;
  createdAt: string;
  user: { id: string; fullName: string | null; username: string | null };
  ticketType: { id: string; name: string } | null;
}

/** Full event shape from `GET /admin/events/:id`. */
export interface AdminEventDetail {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  coverImageUrl: string | null;
  status: AdminEventStatus;
  type: string;
  registrationType: string;
  visibility: string;
  startDateTime: string;
  endDateTime: string;
  timezone: string;
  venueName: string | null;
  venueAddress: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  onlineUrl: string | null;
  onlinePlatform: string | null;
  capacity: number | null;
  registeredCount: number;
  waitlistEnabled: boolean;
  waitlistCount: number;
  isFree: boolean;
  tags: string[];
  category: string | null;
  publishedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  space: { id: string; name: string; slug: string } | null;
  creator: {
    id: string;
    fullName: string | null;
    username: string | null;
    mobileNumber: string | null;
    email: string | null;
  };
  ticketTypes: AdminEventDetailTicketType[];
  parentEvent: { id: string; title: string; slug: string } | null;
  childEvents: AdminEventChild[];
  recentRegistrations: AdminEventRegistration[];
  _count: { registrations: number; childEvents: number };
  attendeeCount: number;
  sales: {
    grossSales: number;
    processingFees: number;
    refunded: number;
    paidRegistrations: number;
  };
}

/** Admin: all events. `GET /admin/events`. */
export async function getAllEventsAdmin(params?: {
  page?: number;
  limit?: number;
  status?: AdminEventStatus;
  search?: string;
}): Promise<{ data: AdminEventListResponse | null; error: ApiError | null }> {
  return apiCall<AdminEventListResponse>(
    backendClient.get("/admin/events", { params })
  );
}

/** Admin: one event in full. `GET /admin/events/:id`. */
export async function getEventAdmin(
  id: string
): Promise<{ data: AdminEventDetail | null; error: ApiError | null }> {
  return apiCall<AdminEventDetail>(backendClient.get(`/admin/events/${id}`));
}

/** Admin: publish a draft event. `POST /admin/events/:id/publish`. */
export async function publishEventAdmin(id: string) {
  return apiCall(backendClient.post(`/admin/events/${id}/publish`));
}

/** Admin: cancel an event (notifies attendees). `POST /admin/events/:id/cancel`. */
export async function cancelEventAdmin(id: string, reason: string) {
  return apiCall(backendClient.post(`/admin/events/${id}/cancel`, { reason }));
}

/** Admin: hide a completed/cancelled event. `POST /admin/events/:id/hide`. */
export async function hideEventAdmin(id: string) {
  return apiCall(backendClient.post(`/admin/events/${id}/hide`));
}

/** Admin: restore a hidden event. `POST /admin/events/:id/restore`. */
export async function restoreEventAdmin(id: string) {
  return apiCall(backendClient.post(`/admin/events/${id}/restore`));
}
