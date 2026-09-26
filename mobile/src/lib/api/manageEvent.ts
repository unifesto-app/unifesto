import { makeAuthenticatedRequest } from './helpers';

/**
 * Operator-side event endpoints for the mobile event hub. Each call resolves to
 * a Result so screens can tell "you can't see this" (render nothing / explain)
 * apart from "it failed" (offer a retry). The backend answers a missing
 * permission with 400 "Unauthorized" or 403, so both count as `denied`.
 */
export type Result<T> = { ok: true; data: T } | { ok: false; denied: boolean; message: string };

export async function call<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const response = await makeAuthenticatedRequest(path, init);
    if (!response) return { ok: false, denied: false, message: 'No connection' };
    const body = await response.json().catch(() => null);
    if (response.ok) return { ok: true, data: body as T };
    const message: string = (Array.isArray(body?.message) ? body.message[0] : body?.message) || 'Something went wrong';
    const denied = response.status === 403 || (response.status === 400 && /unauthori[sz]ed/i.test(message));
    return { ok: false, denied, message };
  } catch {
    return { ok: false, denied: false, message: 'No connection' };
  }
}

// ── Stats ────────────────────────────────────────────────────────────────────

export interface AttendeeStats {
  attendees: number;
  individual: { attendees: number; bookings: number };
  group: { attendees: number; groups: number };
  byTicketType: { ticketTypeId: string | null; name: string; kind: string; attendees: number; bookings: number }[];
}

/** GET /events/:id/attendee-stats — people attending, split individual vs group. */
export const getAttendeeStats = (eventId: string) => call<AttendeeStats>(`/events/${eventId}/attendee-stats`);

// ── Attendees ────────────────────────────────────────────────────────────────

export type RegistrationStatus = 'REGISTERED' | 'ATTENDED' | 'CANCELLED' | string;
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | string;

export interface AttendeeRow {
  id: string;
  status: RegistrationStatus;
  paymentStatus: PaymentStatus;
  isWaitlisted: boolean;
  groupSize?: number | null;
  totalAmount: number | string;
  registeredAt: string;
  checkedInAt?: string | null;
  user: { id: string; fullName: string | null; username: string | null; avatarUrl: string | null };
  ticketType?: { id: string; name: string } | null;
}

export type AttendeeFilter = 'attending' | 'cancelled' | 'all';

export interface AttendeePage {
  registrations: AttendeeRow[];
  total: number;
  page: number;
  limit: number;
}

/** GET /events/:id/registrations — paged, searchable (name, username, phone, email, group members). */
export function getAttendees(
  eventId: string,
  opts: { page: number; search?: string; filter: AttendeeFilter; limit?: number },
) {
  const q = new URLSearchParams({ page: String(opts.page), limit: String(opts.limit ?? 30) });
  if (opts.search?.trim()) q.set('search', opts.search.trim());
  if (opts.filter === 'attending') q.set('attendingOnly', 'true');
  if (opts.filter === 'cancelled') q.set('status', 'CANCELLED');
  return call<AttendeePage>(`/events/${eventId}/registrations?${q.toString()}`);
}

export interface CheckinRecord {
  checkedInAt: string;
  checkinType?: { id: string; name: string } | null;
  checkedInByUser?: { fullName: string | null; username: string | null } | null;
}

/** What a member filled in for their seat (at booking, by the organiser, or when claiming). */
export interface SeatMemberDetails {
  name?: string;
  email?: string;
  mobile?: string;
  gender?: string;
  /** Per-member custom-field answers, keyed by field id. */
  customFields?: Record<string, unknown>;
}

export interface GroupSeatRow {
  /** 1-based; seat 1 is the lead. */
  seatIndex: number;
  status: 'OPEN' | 'INVITED' | 'CLAIMED' | 'RELEASED' | string;
  inviteEmail: string | null;
  memberDetails?: SeatMemberDetails | null;
  claimedAt?: string | null;
  claimedBy: { fullName: string | null; username: string | null; email: string | null } | null;
}

export interface AttendeeDetail extends AttendeeRow {
  user: AttendeeRow['user'] & { mobileNumber?: string | null; email?: string | null };
  ticketType?: { id: string; name: string; price: number | string; currency: string } | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  checkinRecords?: CheckinRecord[];
  groupSeats?: GroupSeatRow[];
  /** Registration-form answers keyed by field id (a group's team-wide answers). */
  formResponses?: Record<string, unknown> | null;
}

/** GET /events/:id/registrations/:registrationId */
export const getAttendee = (eventId: string, registrationId: string) =>
  call<AttendeeDetail>(`/events/${eventId}/registrations/${registrationId}`);

/** POST .../restore — un-cancel (seats + tickets come back; money untouched). */
export const restoreAttendee = (eventId: string, registrationId: string) =>
  call<AttendeeDetail>(`/events/${eventId}/registrations/${registrationId}/restore`, { method: 'POST' });

// ── WhatsApp ─────────────────────────────────────────────────────────────────

export interface WhatsappBlastResult {
  eligible: number;
  sent: number;
  noPhone: number;
  noLink: number;
  failed: number;
}

/** POST /events/:id/whatsapp-group-invite — sends once to every un-invited confirmed attendee. */
export const sendWhatsappBlast = (eventId: string) =>
  call<WhatsappBlastResult>(`/events/${eventId}/whatsapp-group-invite`, { method: 'POST' });

// ── Attendee actions ─────────────────────────────────────────────────────────

/**
 * POST .../cancel — organiser cancels a free or unpaid registration. The
 * reason is stored and included in the attendee's cancellation email. Paid
 * tickets are refused (raise a refund).
 */
export const cancelAttendee = (eventId: string, registrationId: string, reason?: string) =>
  call<{ message: string }>(`/events/${eventId}/registrations/${registrationId}/cancel`, {
    method: 'POST',
    body: JSON.stringify(reason ? { reason } : {}),
  });

/** POST /refunds — a curator-raised refund goes to the Unifesto admin for approval. */
export const requestAttendeeRefund = (registrationId: string, reason: string) =>
  call<unknown>('/refunds', { method: 'POST', body: JSON.stringify({ registrationId, reason }) });

/** Retire an unfilled group seat (OPEN/INVITED → RELEASED). Capacity stays held, nothing is refunded. */
export const releaseGroupSeat = (eventId: string, registrationId: string, seatIndex: number) =>
  call<unknown>(`/events/${eventId}/registrations/${registrationId}/seats/${seatIndex}/release`, { method: 'POST' });

/** Bring a released seat back (RELEASED → OPEN). */
export const reopenGroupSeat = (eventId: string, registrationId: string, seatIndex: number) =>
  call<unknown>(`/events/${eventId}/registrations/${registrationId}/seats/${seatIndex}/reopen`, { method: 'POST' });

export interface TransferRequest {
  id: string;
  targetEmail: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote: string | null;
  createdAt: string;
  registration: { id: string };
}

/**
 * POST .../transfer-request — ask a Unifesto admin to move this ticket to
 * another account. Same ticket, QR, payment and group; only the holder changes.
 */
export const requestAttendeeTransfer = (eventId: string, registrationId: string, email: string, reason?: string) =>
  call<TransferRequest>(`/events/${eventId}/registrations/${registrationId}/transfer-request`, {
    method: 'POST',
    body: JSON.stringify({ email, ...(reason ? { reason } : {}) }),
  });

/** The latest transfer request I raised for this registration, if any. */
export async function getTransferRequestFor(registrationId: string) {
  const res = await call<TransferRequest[]>('/registration-transfer-requests/my');
  if (!res.ok) return null;
  return res.data.find((r) => r.registration?.id === registrationId) ?? null;
}
