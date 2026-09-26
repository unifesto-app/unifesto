import { call } from './manageEvent';
import type { SupportMessage, SupportTicketCategory, SupportTicketPriority, SupportTicketStatus } from './support';
import type { ReportTarget } from './contentReports';

/*
 * Platform-admin side of support and content reports. The ticket list/detail/
 * reply endpoints are shared with requesters and widen to every ticket for an
 * ADMIN; PATCH /support/tickets/:id and /content-reports/admin are ADMIN-only.
 */

const qs = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
};

// ── Support tickets ──────────────────────────────────────────────────────────

export interface SupportPerson {
  id: string;
  fullName: string | null;
  username: string | null;
  avatarUrl?: string | null;
  mobileNumber?: string | null;
  identities?: { email: string | null }[];
}

export interface AdminTicket {
  id: string;
  ticketNumber: number;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  contactEmail: string | null;
  lastMessageAt: string;
  createdAt: string;
  requesterId: string;
  assignedToId: string | null;
  requester?: SupportPerson | null;
  assignedTo?: SupportPerson | null;
  space?: { id: string; name: string; slug: string; logoUrl?: string | null } | null;
  messages?: (SupportMessage & { author?: SupportPerson })[];
  _count?: { messages: number };
}

export interface TicketStats {
  open: number;
  pending: number;
  resolved: number;
  closed: number;
  total: number;
}

export const PRIORITY_LABEL: Record<SupportTicketPriority, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
};

/** GET /support/tickets — every ticket for an admin; search matches subject or #number. */
export const listAllTickets = (opts: { status?: SupportTicketStatus; search?: string; assignedToId?: string; page?: number; limit?: number }) =>
  call<{ tickets: AdminTicket[]; pagination: { total: number } }>(
    `/support/tickets${qs({ status: opts.status, search: opts.search, assignedToId: opts.assignedToId, page: opts.page, limit: opts.limit ?? 20 })}`,
  );

/** GET /support/tickets/stats — platform-wide counts for an admin. */
export const getTicketStats = () => call<TicketStats>('/support/tickets/stats');

/** GET /support/tickets/:id — ticket with its thread and people. */
export const getAdminTicket = (id: string) => call<AdminTicket>(`/support/tickets/${id}`);

/** POST /support/tickets/:id/messages — an admin reply is marked as staff and moves the ticket to PENDING. */
export const replyAsStaff = (id: string, body: string) =>
  call<SupportMessage>(`/support/tickets/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) });

/** PATCH /support/tickets/:id — triage. `assignedToId: null` unassigns. */
export const triageTicket = (
  id: string,
  patch: { status?: SupportTicketStatus; priority?: SupportTicketPriority; category?: SupportTicketCategory; assignedToId?: string | null },
) => call<AdminTicket>(`/support/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

// ── Content reports ──────────────────────────────────────────────────────────

export type ReportStatus = 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';

export interface ContentReport {
  id: string;
  targetType: ReportTarget;
  targetId: string;
  /** Title / name of what was reported, or "(deleted)". */
  targetName: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reporter: { id: string; fullName: string | null; username: string | null } | null;
}

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  OPEN: 'Open',
  REVIEWING: 'Reviewing',
  RESOLVED: 'Resolved',
  DISMISSED: 'Dismissed',
};

/** GET /content-reports/admin — newest first, capped at 200 by the server. */
export const listContentReports = (opts: { status?: ReportStatus; type?: ReportTarget } = {}) =>
  call<ContentReport[]>(`/content-reports/admin${qs({ status: opts.status, type: opts.type })}`);

/** PATCH /content-reports/admin/:id — move a report through review. */
export const moveContentReport = (id: string, status: ReportStatus, resolutionNote?: string) =>
  call<ContentReport>(`/content-reports/admin/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, ...(resolutionNote?.trim() ? { resolutionNote: resolutionNote.trim() } : {}) }),
  });
