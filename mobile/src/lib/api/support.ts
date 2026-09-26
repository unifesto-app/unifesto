/**
 * Support API client for the mobile app.
 *
 * Wraps the NestJS `/support` endpoints. Attendees can raise tickets, track
 * their conversations, reply, and close/reopen — all scoped server-side to the
 * signed-in user.
 */

import { makeAuthenticatedRequest } from './helpers';

export type SupportTicketStatus = 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';
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
  isStaffReply: boolean;
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
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  messages?: SupportMessage[];
  _count?: { messages: number };
}

export interface CreateTicketInput {
  subject: string;
  message: string;
  category?: SupportTicketCategory;
  priority?: SupportTicketPriority;
  contactEmail?: string;
  /** Raise it on behalf of a space (operator support). */
  spaceId?: string;
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

export const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  OPEN: 'Open',
  PENDING: 'Awaiting reply',
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
      body: JSON.stringify(input),
    });
    if (!res?.ok) return null;
    return (await res.json()) as SupportTicket;
  } catch (error) {
    if (__DEV__) console.error('[support] createTicket failed:', error);
    return null;
  }
}

/** List the signed-in user's tickets, newest activity first; `spaceId` narrows to one space's. */
export async function listMyTickets(spaceId?: string): Promise<SupportTicket[]> {
  try {
    const res = await makeAuthenticatedRequest(`/support/tickets?limit=50${spaceId ? `&spaceId=${spaceId}` : ''}`);
    if (!res?.ok) return [];
    const data = await res.json();
    return (data.tickets ?? []) as SupportTicket[];
  } catch (error) {
    if (__DEV__) console.error('[support] listMyTickets failed:', error);
    return [];
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

/** Post a reply to a ticket. Returns the created message or null. */
export async function replyToTicket(
  id: string,
  body: string,
): Promise<SupportMessage | null> {
  try {
    const res = await makeAuthenticatedRequest(`/support/tickets/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
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
