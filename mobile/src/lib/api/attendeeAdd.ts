
import { call } from './manageEvent';

/*
 * Curator adds people to an event by hand or from a CSV
 * (event:manage-attendees). Accounts are found or created by email. A paid
 * ticket sends the person a Razorpay payment link unless a Platform Admin
 * has approved free adds for the event.
 */

export interface ManualMember {
  name: string;
  email: string;
  mobile: string;
  gender: string;
  customFields?: Record<string, unknown>;
}

export interface ManualAddPayload {
  ticketTypeId: string;
  name: string;
  email: string;
  mobile: string;
  gender: string;
  groupSize?: number;
  /** Members 2..N (the lead is the person above). */
  groupMembers?: ManualMember[];
  /** Individual: the person's answers. Group: the team-wide answers. */
  formResponses?: Record<string, unknown>;
  /** Group only: the lead's own per-member answers. */
  leadCustomFields?: Record<string, unknown>;
  collectPayment?: boolean;
}

export interface ManualAddResult {
  registrationId: string;
  paymentStatus: 'PAID' | 'PENDING';
  paymentLinkUrl?: string;
  amount?: number;
  message: string;
}

export const manualAddAttendee = (eventId: string, body: ManualAddPayload) =>
  call<ManualAddResult>(`/events/${eventId}/registrations/manual`, { method: 'POST', body: JSON.stringify(body) });

// ── Free-add exception ───────────────────────────────────────────────────────

export interface FreeAddRequest {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason: string;
  reviewNote?: string | null;
}

/** Ask a Platform Admin to allow adding people to paid tickets without payment. */
export const requestFreeAdds = (eventId: string, reason: string) =>
  call<FreeAddRequest>('/free-attendee-add/requests', { method: 'POST', body: JSON.stringify({ eventId, reason }) });

export const getMyFreeAddRequests = (eventId: string) =>
  call<FreeAddRequest[]>(`/free-attendee-add/requests/my?eventId=${eventId}`);
