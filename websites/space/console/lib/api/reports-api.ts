/**
 * Reports API — organiser-side event report generation.
 *
 * Backed by the NestJS `/events/:eventId/reports` controller. Gated by the
 * space plan's `hasAnalytics`; the backend enforces organiser membership and
 * the plan on every call. A generated report's PDF lives in S3 and is linked by
 * `fileUrl`, so the browser downloads straight from that URL.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

// ============================================================================
// TYPES
// ============================================================================

export type ReportType = "DEFAULT" | "CUSTOM";
export type ReportStatus = "PENDING" | "READY" | "FAILED";
export type ReportSection =
  | "OVERVIEW"
  | "TICKETS"
  | "ATTENDEES"
  | "REVENUE"
  | "CHECKINS";

/** Sections an organiser can toggle for a CUSTOM report, in display order. */
export const REPORT_SECTIONS: { key: ReportSection; label: string; hint: string }[] =
  [
    { key: "OVERVIEW", label: "Overview", hint: "Headline KPIs at a glance" },
    { key: "CHECKINS", label: "Check-ins", hint: "Attendance summary" },
    { key: "TICKETS", label: "Tickets", hint: "Sales by ticket type" },
    { key: "REVENUE", label: "Revenue", hint: "Collected, fees, refunds, net" },
    { key: "ATTENDEES", label: "Attendees", hint: "Full attendee roster" },
  ];

/** Snapshot of headline figures stored on the report at generation time. */
export interface ReportStats {
  totalRegistrations: number;
  attending: number;
  checkedIn: number;
  waitlisted: number;
  attendanceRate: number | null;
  capacityFill: number | null;
  collected: number;
  fees: number;
  refunded: number;
  net: number;
}

export interface EventReport {
  id: string;
  type: ReportType;
  status: ReportStatus;
  title: string;
  sections: ReportSection[];
  dateFrom: string | null;
  dateTo: string | null;
  stats: ReportStats | null;
  fileUrl: string | null;
  fileName: string | null;
  error: string | null;
  /** M3: AI-written summary of an ended event; null when there is none. */
  aiSummary: string | null;
  createdAt: string;
}

export interface CreateReportInput {
  type: ReportType;
  /** Required (non-empty) when type is CUSTOM. */
  sections?: ReportSection[];
  title?: string;
  dateFrom?: string;
  dateTo?: string;
}

type Result<T> = Promise<{ data: T | null; error: ApiError | null }>;

// ============================================================================
// API
// ============================================================================

/** `POST /events/:eventId/reports` — generate a report (returns the row). */
export async function generateReport(
  eventId: string,
  input: CreateReportInput
): Result<EventReport> {
  return apiCall<EventReport>(
    backendClient.post(`/events/${eventId}/reports`, input)
  );
}

/** `GET /events/:eventId/reports` — the event's report history, newest first. */
export async function getEventReports(eventId: string): Result<EventReport[]> {
  return apiCall<EventReport[]>(
    backendClient.get(`/events/${eventId}/reports`)
  );
}

/** `POST /events/:eventId/reports/:reportId/regenerate` — re-render with a fresh summary. */
export async function regenerateReport(
  eventId: string,
  reportId: string
): Result<EventReport> {
  return apiCall<EventReport>(
    backendClient.post(`/events/${eventId}/reports/${reportId}/regenerate`)
  );
}

/** `DELETE /events/:eventId/reports/:reportId`. */
export async function deleteReport(
  eventId: string,
  reportId: string
): Result<{ deleted: boolean }> {
  return apiCall<{ deleted: boolean }>(
    backendClient.delete(`/events/${eventId}/reports/${reportId}`)
  );
}
