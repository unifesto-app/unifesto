/**
 * Refunds API client (mobile).
 *
 * An attendee raises a refund request through support: we open a support ticket
 * for the conversation, then link a refund request to it. From there the
 * organiser verifies and forwards it, and an admin makes the final decision.
 * Only the base ticket price is refundable — the processing fee is not.
 */

import { makeAuthenticatedRequest } from './helpers';
import { createTicket } from './support';

/**
 * Lifecycle of a refund request, mirroring the backend `RefundStatus` enum.
 * An attendee's request starts at PENDING_CURATOR, moves to PENDING_ADMIN once
 * the organiser forwards it, and ends APPROVED or REJECTED.
 */
export type RefundStatus =
  | 'PENDING_CURATOR'
  | 'PENDING_ADMIN'
  | 'PROCESSING'
  | 'APPROVED'
  | 'REJECTED';

/** A single refund request as returned by `GET /refunds/my`. */
export interface RefundRequest {
  id: string;
  status: RefundStatus;
  reason: string;
  requestedAmount: string | number | null;
  approvedAmount: string | number | null;
  cashRefunded: string | number;
  /** Organiser verification note + when they acted (null until reviewed). */
  curatorNote: string | null;
  curatorActionAt: string | null;
  /** Admin decision note + when they acted (null until decided). */
  adminNote: string | null;
  adminActionAt: string | null;
  createdAt: string;
  updatedAt: string;
  registration?: { id: string } | null;
  event?: { id: string; title: string; slug?: string } | null;
}

/** Statuses where the request is still moving through the pipeline. */
export const OPEN_REFUND_STATUSES: RefundStatus[] = ['PENDING_CURATOR', 'PENDING_ADMIN', 'PROCESSING'];

export interface RequestRefundInput {
  registrationId: string;
  eventTitle: string;
  reason: string;
}

export async function requestRefund(
  input: RequestRefundInput,
): Promise<{ ok: boolean; error?: string }> {
  // Open a support ticket first so the attendee has a thread to follow up on.
  // Non-fatal if it fails — the refund request can still be raised on its own.
  let supportTicketId: string | undefined;
  try {
    const ticket = await createTicket({
      subject: `Refund request: ${input.eventTitle}`.slice(0, 300),
      message: input.reason,
      category: 'PAYMENTS',
    });
    supportTicketId = ticket?.id;
  } catch {
    // ignore — proceed without a linked ticket
  }

  try {
    const res = await makeAuthenticatedRequest('/refunds', {
      method: 'POST',
      body: JSON.stringify({
        registrationId: input.registrationId,
        reason: input.reason,
        supportTicketId,
      }),
    });
    if (!res) return { ok: false, error: 'You need to be signed in.' };
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const msg = Array.isArray(body?.message) ? body.message[0] : body?.message;
      return { ok: false, error: msg || 'Could not submit your refund request.' };
    }
    return { ok: true };
  } catch (error) {
    if (__DEV__) console.error('[refunds] requestRefund failed:', error);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

/**
 * Fetch the signed-in user's refund requests. When `registrationId` is given,
 * the list is narrowed to that registration so a ticket can show its own
 * refund progress. Newest first (the backend orders by createdAt desc).
 */
export async function getMyRefunds(
  registrationId?: string,
): Promise<RefundRequest[]> {
  try {
    const res = await makeAuthenticatedRequest('/refunds/my?limit=50', {
      method: 'GET',
    });
    if (!res || !res.ok) return [];
    const body = await res.json().catch(() => null);
    const requests: RefundRequest[] = Array.isArray(body?.requests) ? body.requests : [];
    if (!registrationId) return requests;
    return requests.filter((r) => r.registration?.id === registrationId);
  } catch (error) {
    if (__DEV__) console.error('[refunds] getMyRefunds failed:', error);
    return [];
  }
}
