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
  /** D20: the requester's 1-5 rating once resolved, and optional comment. */
  rating?: number | null;
  ratingComment?: string | null;
  closedAt: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  messages?: SupportMessage[];
  _count?: { messages: number };
  /** List endpoint: a message your side hasn't opened yet. */
  unread?: boolean;
  /** Desk viewers: the SLA deadline it works to now (null once its clock stops). */
  sla?: CaseSla | null;
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
  /** D19: cases past their SLA due time. */
  overdue?: number;
  /** D19: median reply and resolution times per desk over the last 30 days. */
  desks?: Record<SupportDesk, DeskTimes>;
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
  /** D19: only cases past their SLA due time. */
  overdue?: boolean;
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
  body: string
): Promise<Result<SupportMessage>> {
  return apiCall<SupportMessage>(
    backendClient.post(`/support/tickets/${id}/messages`, { body })
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

/* -------------------------------------------------------------------------- */
/* D19: saved replies and SLA                                                  */
/* -------------------------------------------------------------------------- */

/** The deadline a case works to: the desk's first reply, then resolution. */
export interface CaseSla {
  stage: "RESPOND" | "RESOLVE";
  dueAt: string;
  overdue: boolean;
}

/** Median minutes to the desk's first reply and to resolution over the last 30 days. */
export interface DeskTimes {
  firstResponseMins: number | null;
  resolutionMins: number | null;
  cases: number;
}

export interface CannedReply {
  id: string;
  spaceId: string | null;
  title: string;
  body: string;
}

/** `GET /support/canned-replies` — a desk's saved replies (no spaceId = Unifesto's). */
export async function listCannedReplies(spaceId?: string): Promise<Result<CannedReply[]>> {
  return apiCall<CannedReply[]>(
    backendClient.get(`/support/canned-replies${spaceId ? `?spaceId=${spaceId}` : ""}`)
  );
}

export async function createCannedReply(input: { spaceId?: string; title: string; body: string }): Promise<Result<CannedReply>> {
  return apiCall<CannedReply>(backendClient.post("/support/canned-replies", input));
}

export async function updateCannedReply(id: string, input: { title: string; body: string }): Promise<Result<CannedReply>> {
  return apiCall<CannedReply>(backendClient.patch(`/support/canned-replies/${id}`, input));
}

export async function deleteCannedReply(id: string): Promise<Result<{ deleted: boolean }>> {
  return apiCall<{ deleted: boolean }>(backendClient.delete(`/support/canned-replies/${id}`));
}

/** "3h 20m", "2d 4h" — a desk time or what is left on a deadline. */
export function formatMins(mins: number | null | undefined): string {
  if (mins == null) return "No data";
  const m = Math.abs(Math.round(mins));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  return h % 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${Math.floor(h / 24)}d`;
}

/** "Reply due in 3h" / "Resolution overdue by 2d". */
export function slaText(sla: CaseSla): string {
  const what = sla.stage === "RESPOND" ? "Reply" : "Resolution";
  const mins = (new Date(sla.dueAt).getTime() - Date.now()) / 60000;
  return sla.overdue ? `${what} overdue by ${formatMins(mins)}` : `${what} due in ${formatMins(mins)}`;
}
