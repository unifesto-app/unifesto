/**
 * Support API client for the mobile app.
 *
 * Wraps the NestJS `/support` endpoints. Attendees can raise tickets, track
 * their conversations, reply, and close/reopen — all scoped server-side to the
 * signed-in user.
 */

import { makeAuthenticatedRequest } from './helpers';
import { call } from './manageEvent';
import { buildInfo, type BuildInfo } from '../appBuild';

export type SupportTicketStatus = 'BOT' | 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';
export type SupportCaseKind = 'HELP' | 'REFUND' | 'CANCELLATION' | 'REQUEST' | 'REPORT' | 'PRIVACY' | 'GRIEVANCE';
/** Which inbox works the case: the space in `space`, or Unifesto. */
export type SupportDesk = 'SPACE' | 'PLATFORM';
export type SupportMessageSide = 'REQUESTER' | 'DESK' | 'ASSISTANT' | 'SYSTEM';
export type SupportTicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type SupportTicketCategory =
  | 'GENERAL'
  | 'ACCOUNT'
  | 'PAYMENTS'
  | 'EVENTS'
  | 'TICKETING'
  | 'TECHNICAL'
  | 'OTHER';

export interface SupportAuthor {
  id: string;
  fullName: string | null;
  username: string | null;
  avatarUrl?: string | null;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  authorId: string;
  /** Legacy; `side` says who wrote it. */
  isStaffReply: boolean;
  side?: SupportMessageSide;
  /** Desk-only note; the server never sends these to the requester. */
  internal?: boolean;
  body: string;
  createdAt: string;
  author?: SupportAuthor;
}

export interface SupportTicket {
  id: string;
  ticketNumber: number;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  contactEmail: string | null;
  kind: SupportCaseKind;
  desk: SupportDesk;
  requesterId: string;
  eventId: string | null;
  registrationId: string | null;
  /** The typed record it wraps, e.g. User for an account deletion (D24). */
  subjectType?: string | null;
  /** Set when the space handed it to Unifesto; the space keeps read. */
  escalatedAt: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  messages?: SupportMessage[];
  _count?: { messages: number };
  /** Included by the list endpoint. */
  requester?: SupportAuthor & { identities?: { email: string | null }[] };
  /** The space whose desk has or had it, or the space an operator raised it for. */
  space?: { id: string; name: string; slug: string } | null;
  /** List endpoint: a message you haven't opened yet. */
  unread?: boolean;
}

export interface CreateTicketInput {
  subject: string;
  message: string;
  category?: SupportTicketCategory;
  priority?: SupportTicketPriority;
  contactEmail?: string;
  /** The app build this was raised from; filled in by createTicket. */
  clientInfo?: BuildInfo;
  /** Raise it on behalf of a space (operator support). */
  spaceId?: string;
  /** Event context: the backend sends event questions to the organiser's desk. */
  eventId?: string;
  /** The requester's own registration; implies its event. */
  registrationId?: string;
}

export const CATEGORY_LABEL: Record<SupportTicketCategory, string> = {
  GENERAL: 'General',
  ACCOUNT: 'Account',
  PAYMENTS: 'Payments',
  EVENTS: 'Events',
  TICKETING: 'Ticketing',
  TECHNICAL: 'Technical',
  OTHER: 'Other',
};

export const KIND_LABEL: Record<SupportCaseKind, string> = {
  HELP: 'Help',
  REFUND: 'Refund',
  CANCELLATION: 'Cancellation',
  REQUEST: 'Request',
  REPORT: 'Report',
  PRIVACY: 'Privacy',
  GRIEVANCE: 'Grievance',
};

export const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  BOT: 'With Assist',
  OPEN: 'Open',
  // Requester-side wording: a staff reply sets PENDING, so the ball is with them.
  PENDING: 'Replied',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

/** The same statuses from the desk's side: OPEN is theirs to answer. */
export const DESK_STATUS_LABEL: Record<SupportTicketStatus, string> = {
  BOT: 'With Assist',
  OPEN: 'Needs reply',
  PENDING: 'Waiting on them',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

/** Raise a new support ticket. Returns the created ticket or null on failure. */
export async function createTicket(
  input: CreateTicketInput,
): Promise<SupportTicket | null> {
  try {
    const res = await makeAuthenticatedRequest('/support/tickets', {
      method: 'POST',
      // Every ticket says which build + OTA update it came from.
      body: JSON.stringify({ clientInfo: buildInfo(), ...input }),
    });
    if (!res?.ok) return null;
    return (await res.json()) as SupportTicket;
  } catch (error) {
    if (__DEV__) console.error('[support] createTicket failed:', error);
    return null;
  }
}

/** The signed-in user's cases of every kind, newest activity first. */
export async function listMyTickets(): Promise<SupportTicket[]> {
  try {
    const res = await makeAuthenticatedRequest('/support/tickets?limit=100');
    if (!res?.ok) return [];
    const data = await res.json();
    return (data.tickets ?? []) as SupportTicket[];
  } catch (error) {
    if (__DEV__) console.error('[support] listMyTickets failed:', error);
    return [];
  }
}

/** How many of your own requests have a reply you haven't opened. */
export async function getMyUnreadCount(): Promise<number> {
  try {
    const res = await makeAuthenticatedRequest('/support/tickets/stats');
    if (!res?.ok) return 0;
    const data = await res.json();
    return typeof data.myUnread === 'number' ? data.myUnread : 0;
  } catch {
    return 0;
  }
}

/** Fetch one ticket with its full message thread. */
export async function getTicket(id: string): Promise<SupportTicket | null> {
  try {
    const res = await makeAuthenticatedRequest(`/support/tickets/${id}`);
    if (!res?.ok) return null;
    return (await res.json()) as SupportTicket;
  } catch (error) {
    if (__DEV__) console.error('[support] getTicket failed:', error);
    return null;
  }
}

/** Post a reply to a ticket, or with `internal` a desk-only note. Returns the created message or null. */
export async function replyToTicket(
  id: string,
  body: string,
  internal?: boolean,
): Promise<SupportMessage | null> {
  try {
    const res = await makeAuthenticatedRequest(`/support/tickets/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify(internal ? { body, internal } : { body }),
    });
    if (!res?.ok) return null;
    return (await res.json()) as SupportMessage;
  } catch (error) {
    if (__DEV__) console.error('[support] replyToTicket failed:', error);
    return null;
  }
}

/** Close the user's own ticket. */
export async function closeTicket(id: string): Promise<boolean> {
  try {
    const res = await makeAuthenticatedRequest(`/support/tickets/${id}/close`, {
      method: 'PATCH',
    });
    return !!res?.ok;
  } catch (error) {
    if (__DEV__) console.error('[support] closeTicket failed:', error);
    return false;
  }
}

/** Reopen the user's own ticket. */
export async function reopenTicket(id: string): Promise<boolean> {
  try {
    const res = await makeAuthenticatedRequest(`/support/tickets/${id}/reopen`, {
      method: 'PATCH',
    });
    return !!res?.ok;
  } catch (error) {
    if (__DEV__) console.error('[support] reopenTicket failed:', error);
    return false;
  }
}

// ── Space desk (D9) ──────────────────────────────────────────────────────────

/** GET /support/spaces/:spaceId/desk — the cases this space's desk shows you; 403 if you work none of it. */
export const listSpaceDesk = (
  spaceId: string,
  opts: { status?: SupportTicketStatus; unread?: boolean; search?: string; page?: number },
) => {
  const q = new URLSearchParams({ page: String(opts.page ?? 1), limit: '20' });
  if (opts.status) q.set('status', opts.status);
  if (opts.unread) q.set('unread', 'true');
  if (opts.search) q.set('search', opts.search);
  return call<{ tickets: SupportTicket[]; pagination: { total: number } }>(`/support/spaces/${spaceId}/desk?${q}`);
};

/** GET /support/spaces/:spaceId/desk/unread — fails (403) for someone who works no part of the desk. */
export const getSpaceDeskUnread = (spaceId: string) => call<{ unread: number }>(`/support/spaces/${spaceId}/desk/unread`);

/** POST /support/tickets/:id/escalate — hand a space-desk case to Unifesto (requester or the space desk). */
export const escalateTicket = (id: string) => call<SupportTicket>(`/support/tickets/${id}/escalate`, { method: 'POST' });
