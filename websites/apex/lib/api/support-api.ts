/**
 * Support API — the ticket-based helpdesk shared by both Apex surfaces.
 *
 * Backed by the NestJS `/support` controller. The same endpoints are
 * role-scoped by the backend: admins see and triage every ticket, organisers
 * see and reply to the tickets they raised (optionally scoped to a space).
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type SupportTicketStatus = "BOT" | "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
export type SupportCaseKind =
  | "HELP"
  | "REFUND"
  | "CANCELLATION"
  | "REQUEST"
  | "REPORT"
  | "PRIVACY"
  | "GRIEVANCE";
export type SupportDesk = "SPACE" | "PLATFORM";
export type SupportMessageSide = "REQUESTER" | "DESK" | "ASSISTANT" | "SYSTEM";
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
  side?: SupportMessageSide;
  /** Desk-only note, never shown to the requester. */
  internal?: boolean;
  /** D15: the desk sent (an edit of) an Assist draft. */
  aiDrafted?: boolean;
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
  kind: SupportCaseKind;
  desk: SupportDesk;
  requestType?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  escalatedAt?: string | null;
  requesterId: string;
  requester: SupportUser;
  contactEmail: string | null;
  spaceId: string | null;
  space: SupportSpaceRef | null;
  eventId?: string | null;
  /** D13 AI triage: a hint for staff, never acted on by itself. */
  aiTriage?: { routingHint?: SupportDesk; reason?: string } | null;
  assignedToId: string | null;
  assignedTo: SupportUser | null;
  resolvedAt: string | null;
  closedAt: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  messages?: SupportMessage[];
  _count?: { messages: number };
  /** List endpoint: a message your side hasn't opened yet. */
  unread?: boolean;
  /** Detail endpoint, Platform only: the typed records this case wraps. */
  subjects?: CaseSubject[];
}

/** A typed record behind a case: `type` is its model name (RefundRequest, SpaceRequest…). */
export interface CaseSubject {
  type: string;
  data: Record<string, any>;
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
  /** Open with nobody assigned. */
  unassigned: number;
  /** Open + awaiting-reply cases per kind. */
  byKind: Partial<Record<SupportCaseKind, number>>;
}

export interface ListTicketsParams {
  status?: SupportTicketStatus;
  category?: SupportTicketCategory;
  priority?: SupportTicketPriority;
  kind?: SupportCaseKind;
  desk?: SupportDesk;
  /** A user id, or `none` for unassigned. */
  assignedToId?: string;
  spaceId?: string;
  unread?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

/** Window event: a case was read, so the sidebar badge recounts. */
export const ASSIST_READ_EVENT = "assist:read";

type Result<T> = { data: T | null; error: ApiError | null };

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
  body: string,
  aiDrafted = false
): Promise<Result<SupportMessage>> {
  return apiCall<SupportMessage>(
    backendClient.post(`/support/tickets/${id}/messages`, { body, ...(aiDrafted ? { aiDrafted } : {}) })
  );
}

/** D15 copilot: booking facts computed by the backend (refund window, refundable amount). */
export async function getCaseFacts(id: string): Promise<Result<{ facts: string[] }>> {
  return apiCall<{ facts: string[] }>(backendClient.get(`/support/tickets/${id}/facts`));
}

export type DraftResult = { facts: string[] } & (
  | { ok: true; draft: string }
  | { ok: false; reason: "disabled" | "capped" | "refused" | "error" }
);

/** D15 copilot: a reply draft for the desk to edit. Nothing is sent. */
export async function draftReply(id: string): Promise<Result<DraftResult>> {
  return apiCall<DraftResult>(backendClient.post(`/support/tickets/${id}/draft`));
}

/** D15 copilot: the thread summary, refreshed when the thread moved on. */
export async function summariseCase(id: string): Promise<Result<{ summary: string | null }>> {
  return apiCall<{ summary: string | null }>(backendClient.post(`/support/tickets/${id}/summary`));
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

/** `POST /support/tickets/:id/send-to-space` — hand a help question to an event's organiser. */
export async function sendToSpace(id: string, eventId: string): Promise<Result<SupportTicket>> {
  return apiCall<SupportTicket>(
    backendClient.post(`/support/tickets/${id}/send-to-space`, { eventId })
  );
}

/* -------------------------------------------------------------------------- */
/* Display helpers                                                            */
/* -------------------------------------------------------------------------- */

export const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  BOT: "With the bot",
  OPEN: "Open",
  PENDING: "Awaiting reply",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const KIND_LABEL: Record<SupportCaseKind, string> = {
  HELP: "Help",
  REFUND: "Refunds",
  CANCELLATION: "Cancellations",
  REQUEST: "Requests",
  REPORT: "Reports",
  PRIVACY: "Privacy",
  GRIEVANCE: "Grievances",
};

export const DESK_LABEL: Record<SupportDesk, string> = {
  PLATFORM: "Unifesto",
  SPACE: "Space desk",
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
