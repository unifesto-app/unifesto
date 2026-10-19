/**
 * Support API — the ticket-based helpdesk shared by both Apex surfaces.
 *
 * Backed by the NestJS `/support` controller. The same endpoints are
 * role-scoped by the backend: admins see and triage every ticket, organisers
 * see and reply to the tickets they raised (optionally scoped to a space).
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type SupportTicketStatus = "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
export type SupportTicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type SupportTicketCategory =
  | "GENERAL"
  | "ACCOUNT"
  | "PAYMENTS"
  | "EVENTS"
  | "TICKETING"
  | "TECHNICAL"
  | "OTHER";

export interface SupportUser {
  id: string;
  fullName: string | null;
  username: string | null;
  avatarUrl?: string | null;
  mobileNumber?: string | null;
  identities?: { email: string | null }[];
}

export interface SupportSpaceRef {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  authorId: string;
  isStaffReply: boolean;
  /** Desk-only note; the requester never sees it. */
  internal?: boolean;
  body: string;
  createdAt: string;
  author?: SupportUser;
}

export interface SupportTicket {
  id: string;
  ticketNumber: number;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  requesterId: string;
  requester: SupportUser;
  contactEmail: string | null;
  spaceId: string | null;
  space: SupportSpaceRef | null;
  /** Who works the case now: the space desk, or Unifesto (PLATFORM). */
  desk?: "SPACE" | "PLATFORM";
  escalatedAt?: string | null;
  eventId?: string | null;
  assignedToId: string | null;
  assignedTo: SupportUser | null;
  resolvedAt: string | null;
  closedAt: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  messages?: SupportMessage[];
  /** One case: the refund behind it, when it has one (D6). */
  subjects?: { type: string; data: Record<string, unknown> }[];
  _count?: { messages: number };
  /** List endpoint: a message your side hasn't opened yet. */
  unread?: boolean;
}

export interface SupportTicketsResponse {
  tickets: SupportTicket[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SupportStats {
  open: number;
  pending: number;
  resolved: number;
  closed: number;
  total: number;
  /** Cases on the side you work (Platform's desk for admins) with a message you haven't opened. */
  unread: number;
  /** Cases you raised with a reply you haven't opened. */
  myUnread: number;
}

export interface CreateTicketInput {
  subject: string;
  message: string;
  category?: SupportTicketCategory;
  priority?: SupportTicketPriority;
  spaceId?: string;
  contactEmail?: string;
}

export interface ListTicketsParams {
  status?: SupportTicketStatus;
  category?: SupportTicketCategory;
  priority?: SupportTicketPriority;
  assignedToId?: string;
  spaceId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

type Result<T> = { data: T | null; error: ApiError | null };

/** `POST /support/tickets` — raise a ticket (any authenticated user). */
export async function createTicket(
  input: CreateTicketInput
): Promise<Result<SupportTicket>> {
  return apiCall<SupportTicket>(backendClient.post("/support/tickets", input));
}

/** `GET /support/tickets` — role-scoped list with filters. */
export async function listTickets(
  params: ListTicketsParams = {}
): Promise<Result<SupportTicketsResponse>> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  const qs = query.toString();
  return apiCall<SupportTicketsResponse>(
    backendClient.get(`/support/tickets${qs ? `?${qs}` : ""}`)
  );
}

/** `GET /support/tickets/stats` — status counts for the current viewer. */
export async function getSupportStats(): Promise<Result<SupportStats>> {
  return apiCall<SupportStats>(backendClient.get("/support/tickets/stats"));
}

/** `GET /support/tickets/:id` — full ticket with its message thread. */
export async function getTicket(id: string): Promise<Result<SupportTicket>> {
  return apiCall<SupportTicket>(backendClient.get(`/support/tickets/${id}`));
}

/** `POST /support/tickets/:id/messages` — reply to a ticket. */
export async function replyToTicket(
  id: string,
  body: string
): Promise<Result<SupportMessage>> {
  return apiCall<SupportMessage>(
    backendClient.post(`/support/tickets/${id}/messages`, { body })
  );
}

/** `POST /support/tickets/:id/messages` with `internal` — a desk-only note. */
export async function addInternalNote(
  id: string,
  body: string
): Promise<Result<SupportMessage>> {
  return apiCall<SupportMessage>(
    backendClient.post(`/support/tickets/${id}/messages`, { body, internal: true })
  );
}

/** `POST /support/tickets/:id/escalate` — hand a space-desk case to Unifesto. */
export async function escalateTicket(id: string): Promise<Result<SupportTicket>> {
  return apiCall<SupportTicket>(backendClient.post(`/support/tickets/${id}/escalate`));
}

/* -------------------------------------------------------------------------- */
/* Space desk (D9): cases attendees raise about this space and its events     */
/* -------------------------------------------------------------------------- */

/** Fired after the desk opens a case, so the sidebar badge recounts. */
export const ASSIST_READ_EVENT = "assist:read";

export interface SpaceDeskParams {
  status?: SupportTicketStatus;
  unread?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

/** `GET /support/spaces/:spaceId/desk` — the cases this space's desk shows you. */
export async function listSpaceDesk(
  spaceId: string,
  params: SpaceDeskParams = {}
): Promise<Result<SupportTicketsResponse>> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "" && value !== false) {
      query.set(key, String(value));
    }
  });
  const qs = query.toString();
  return apiCall<SupportTicketsResponse>(
    backendClient.get(`/support/spaces/${spaceId}/desk${qs ? `?${qs}` : ""}`)
  );
}

/** `GET /support/spaces/:spaceId/desk/unread` — unread cases on the desk. */
export async function getSpaceDeskUnread(
  spaceId: string
): Promise<Result<{ unread: number }>> {
  return apiCall<{ unread: number }>(
    backendClient.get(`/support/spaces/${spaceId}/desk/unread`)
  );
}

/** `PATCH /support/tickets/:id/close` — requester closes their own ticket. */
export async function closeOwnTicket(id: string): Promise<Result<SupportTicket>> {
  return apiCall<SupportTicket>(
    backendClient.patch(`/support/tickets/${id}/close`)
  );
}

/** `PATCH /support/tickets/:id/reopen` — requester reopens their own ticket. */
export async function reopenOwnTicket(
  id: string
): Promise<Result<SupportTicket>> {
  return apiCall<SupportTicket>(
    backendClient.patch(`/support/tickets/${id}/reopen`)
  );
}

export interface UpdateTicketInput {
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  category?: SupportTicketCategory;
  assignedToId?: string | null;
}

/** `PATCH /support/tickets/:id` — admin triage (status/priority/assign). */
export async function updateTicket(
  id: string,
  input: UpdateTicketInput
): Promise<Result<SupportTicket>> {
  return apiCall<SupportTicket>(
    backendClient.patch(`/support/tickets/${id}`, input)
  );
}

/* -------------------------------------------------------------------------- */
/* Display helpers                                                            */
/* -------------------------------------------------------------------------- */

export const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  OPEN: "Open",
  PENDING: "Awaiting reply",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const CATEGORY_LABEL: Record<SupportTicketCategory, string> = {
  GENERAL: "General",
  ACCOUNT: "Account",
  PAYMENTS: "Payments",
  EVENTS: "Events",
  TICKETING: "Ticketing",
  TECHNICAL: "Technical",
  OTHER: "Other",
};

export const PRIORITY_LABEL: Record<SupportTicketPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export function requesterName(t: SupportTicket): string {
  return t.requester?.fullName || t.requester?.username || "Unknown user";
}

export function requesterEmail(t: SupportTicket): string | null {
  return t.contactEmail || t.requester?.identities?.[0]?.email || null;
}
