/**
 * Content reports API — users flag an event, a space or one of their tickets
 * from the mobile app; platform admins triage them here.
 *
 * Backed by the NestJS `/content-reports` controller (admin routes are
 * `@Roles(ADMIN)`). The list returns the newest 200 reports with the reported
 * thing's display name resolved (`(deleted)` if it no longer exists).
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type ContentReportTarget = "EVENT" | "SPACE" | "REGISTRATION";
export type ContentReportStatus = "OPEN" | "REVIEWING" | "RESOLVED" | "DISMISSED";

export interface ContentReport {
  id: string;
  reporterId: string;
  reporter: { id: string; fullName: string | null; username: string | null } | null;
  targetType: ContentReportTarget;
  targetId: string;
  targetName: string;
  reason: string;
  details: string | null;
  status: ContentReportStatus;
  resolutionNote: string | null;
  resolvedById: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type Result<T> = { data: T | null; error: ApiError | null };

/**
 * Same labels the mobile app shows the reporter, so admin and reporter read the
 * same words. Keys come from backend `content-report-reasons.ts`.
 */
export const REASON_LABELS: Record<string, string> = {
  scam_or_fraud: "Scam or fraud",
  misleading: "Misleading details",
  fake_or_cancelled: "Fake, or it isn't happening",
  inappropriate: "Inappropriate content",
  spam: "Spam",
  impersonation: "Pretending to be someone else",
  payment_issue: "Payment problem",
  ticket_not_working: "Ticket or QR not working",
  wrong_details: "Wrong details on the ticket",
  event_changed_or_cancelled: "Event changed or was cancelled",
  refund_issue: "Refund problem",
  other: "Something else",
};

export const TARGET_LABELS: Record<ContentReportTarget, string> = {
  EVENT: "Event",
  SPACE: "Space",
  REGISTRATION: "Ticket",
};

/** `GET /content-reports/admin` — newest 200, optionally filtered. */
export async function listContentReports(
  params: { status?: ContentReportStatus; type?: ContentReportTarget } = {}
): Promise<Result<ContentReport[]>> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.type) query.set("type", params.type);
  const qs = query.toString();
  return apiCall<ContentReport[]>(
    backendClient.get(`/content-reports/admin${qs ? `?${qs}` : ""}`)
  );
}

/**
 * `PATCH /content-reports/admin/:id` — move a report through review. RESOLVED
 * and DISMISSED stamp who closed it and when; moving back to OPEN/REVIEWING
 * clears that.
 */
export async function updateContentReport(
  id: string,
  status: ContentReportStatus,
  resolutionNote?: string
): Promise<Result<ContentReport>> {
  return apiCall<ContentReport>(
    backendClient.patch(`/content-reports/admin/${id}`, { status, resolutionNote })
  );
}
