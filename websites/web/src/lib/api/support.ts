import { call } from "@/lib/api/registration";

/* My support cases and inbox on the web: the app's Support screen and Assist (D14), on the same endpoints. */

export type CaseStatus = "BOT" | "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
export type CaseKind = "HELP" | "REFUND" | "CANCELLATION" | "REQUEST" | "REPORT" | "PRIVACY" | "GRIEVANCE";
export type Side = "REQUESTER" | "DESK" | "ASSISTANT" | "SYSTEM";

/** What Assist proposes; I confirm it here and the same endpoint as the ticket page runs. */
export interface AssistAction {
  type: "REQUEST_REFUND" | "CANCEL_BOOKING";
  registrationId: string;
  eventTitle: string;
  label: string;
}

export interface CaseMessage {
  id: string;
  isStaffReply: boolean;
  side?: Side;
  body: string;
  createdAt: string;
  author?: { fullName: string | null; username: string | null } | null;
  actions?: AssistAction[] | null;
}

export interface SupportCase {
  id: string;
  ticketNumber: number;
  subject: string;
  kind: CaseKind;
  status: CaseStatus;
  subjectType?: string | null;
  /** PLATFORM once Unifesto has it; SPACE while the organiser's desk does. */
  desk?: "SPACE" | "PLATFORM";
  escalatedAt?: string | null;
  lastMessageAt: string;
  createdAt: string;
  space?: { name: string } | null;
  unread?: boolean;
  rating?: number | null;
  messages?: CaseMessage[];
}

export const KIND_LABEL: Record<CaseKind, string> = {
  HELP: "Help",
  REFUND: "Refund",
  CANCELLATION: "Cancellation",
  REQUEST: "Request",
  REPORT: "Report",
  PRIVACY: "Privacy",
  GRIEVANCE: "Grievance",
};
/** The requester's view of a status, as the app words it. */
export const STATUS_LABEL: Record<CaseStatus, string> = {
  BOT: "With Assist",
  OPEN: "Open",
  PENDING: "Replied",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

/** Older messages predate `side`; the staff flag is all they have. */
export const sideOf = (m: CaseMessage): Side => m.side ?? (m.isStaffReply ? "DESK" : "REQUESTER");

export const listMyCases = (token: string) =>
  call<{ tickets: SupportCase[] }>("GET", "/support/tickets?limit=100", undefined, token).then((r) => r.tickets ?? []);
export const getMyUnreadCases = (token: string) =>
  call<{ myUnread?: number }>("GET", "/support/tickets/stats", undefined, token).then((r) => r.myUnread ?? 0);
export const getCase = (token: string, id: string) => call<SupportCase>("GET", `/support/tickets/${id}`, undefined, token);
export const replyToCase = (token: string, id: string, body: string) => call("POST", `/support/tickets/${id}/messages`, { body }, token);
/** Starts a request with Assist, about a ticket or event when given. */
export const startAssist = (token: string, body: { message: string; registrationId?: string; eventId?: string }) =>
  call<SupportCase>("POST", "/support/assist", body, token);
/** While with Assist: ask it (answers in the same call), or with no body hand the chat to a person. */
export const assistStep = (token: string, id: string, body?: string) =>
  call<SupportCase>("POST", `/support/tickets/${id}/${body ? "assist" : "handoff"}`, body ? { body } : undefined, token);
export const closeCase = (token: string, id: string) => call("PATCH", `/support/tickets/${id}/close`, undefined, token);
export const reopenCase = (token: string, id: string) => call("PATCH", `/support/tickets/${id}/reopen`, undefined, token);
export const rateCase = (token: string, id: string, rating: number, comment?: string) =>
  call("POST", `/support/tickets/${id}/rating`, { rating, comment }, token);

/** One inbox item. `deepLink` is an app link (unifesto://…); see webLink. */
export interface InboxItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  deepLink: string | null;
  readAt: string | null;
  createdAt: string;
}
/** Help-desk queries go to event staff, not here (the app's Staff tab). */
const INBOX = "excludeType=help_desk";
export const getInbox = (token: string, before?: string) =>
  call<{ items: InboxItem[]; nextBefore: string | null }>(
    "GET",
    `/users/me/notifications?${INBOX}&limit=30${before ? `&before=${encodeURIComponent(before)}` : ""}`,
    undefined,
    token,
  );
export const getInboxUnread = (token: string) =>
  call<{ count: number }>("GET", "/users/me/notifications/unread-count", undefined, token).then((r) => r.count);
/** ids marks those; none marks the whole inbox. */
export const markRead = (token: string, ids?: string[]) =>
  call("POST", "/users/me/notifications/read", ids ? { ids } : { excludeType: "help_desk" }, token);

/** The web page for an app link, when there is one. */
export function webLink(deepLink: string | null): string | null {
  const m = deepLink?.match(/^unifesto:\/\/([^?#]+)/);
  if (!m) return null;
  const [kind, a, b] = m[1].split("/");
  if (kind === "event" && a) return `/event/${a}`;
  if (kind === "manage" && a === "support" && b) return `/account/support/${b}`;
  if (kind === "feedback" && a) return `/feedback/${a}`;
  if (kind === "group" && a) return `/tickets/${a}`;
  return null;
}
