import { File, Paths } from 'expo-file-system';
import { API_URL } from '../constants';
import { getToken } from './helpers';
import { call } from './manageEvent';
import { postMultipart, type UploadFile } from './upload';

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

// ── CSV import ───────────────────────────────────────────────────────────────

export interface ImportPreviewRow {
  line: number;
  name: string;
  email: string;
  outcome: 'create' | 'skip' | 'error';
  newAccount?: boolean;
  reason?: string;
}

export interface ImportPreview {
  ticketTypeName: string;
  total: number;
  willCreate: number;
  willSkip: number;
  willError: number;
  newAccounts: number;
  remainingCapacity: number | null;
  rows: ImportPreviewRow[];
}

export interface ImportReport {
  ticketTypeName: string;
  total: number;
  created: number;
  skipped: number;
  errored: number;
  rows: { line: number; name: string; email: string; status: 'created' | 'skipped' | 'errored'; reason?: string }[];
}

/** Dry run: validates every row, creates nothing. */
export const previewImport = (eventId: string, file: Omit<UploadFile, 'field'>, ticketTypeId: string) =>
  postMultipart<ImportPreview>(`/events/${eventId}/registrations/import/preview`, { ...file, field: 'file' }, { ticketTypeId });

export const runImport = (eventId: string, file: Omit<UploadFile, 'field'>, ticketTypeId: string, sendTicketEmails: boolean) =>
  postMultipart<ImportReport>(`/events/${eventId}/registrations/import`, { ...file, field: 'file' }, {
    ticketTypeId,
    sendTicketEmails: String(sendTicketEmails),
  });

/** The ticket's CSV template (columns follow its kind and questions), saved to cache for sharing. */
export async function downloadImportTemplate(eventId: string, ticketTypeId: string): Promise<{ ok: true; uri: string } | { ok: false; message: string }> {
  const token = await getToken();
  if (!token) return { ok: false, message: 'Sign in again' };
  try {
    const file = await File.downloadFileAsync(
      `${API_URL}/events/${eventId}/registrations/import-template?ticketTypeId=${ticketTypeId}`,
      new File(Paths.cache, `attendee-import-${ticketTypeId.slice(0, 8)}.csv`),
      { headers: { Authorization: `Bearer ${token}` }, idempotent: true },
    );
    return { ok: true, uri: file.uri };
  } catch {
    return { ok: false, message: "Couldn't download the template" };
  }
}
