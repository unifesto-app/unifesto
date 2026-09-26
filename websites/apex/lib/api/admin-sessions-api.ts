/**
 * Admin sessions API — every session across the platform with organiser, space
 * and sales info. Backed by `GET /admin/sessions` and `GET /admin/sessions/:id`.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type AdminSessionStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "CANCELLED"
  | "COMPLETED";

export type SessionPlatform =
  | "GOOGLE_MEET"
  | "ZOOM"
  | "MS_TEAMS"
  | "OTHER"
  | "UNIFESTO_LIVE";

export const PLATFORM_LABELS: Record<SessionPlatform, string> = {
  GOOGLE_MEET: "Google Meet",
  ZOOM: "Zoom",
  MS_TEAMS: "Microsoft Teams",
  OTHER: "Other",
  UNIFESTO_LIVE: "Unifesto Live (in-app)",
};

export interface AdminSessionSales {
  grossSales: number;
  processingFees: number;
  refunded: number;
  paidRegistrations: number;
}

export interface AdminSessionCreator {
  id: string;
  fullName: string | null;
  username: string | null;
  mobileNumber: string | null;
  email: string | null;
}

export interface AdminSession {
  id: string;
  title: string;
  slug: string;
  status: AdminSessionStatus;
  platform: SessionPlatform;
  platformOther: string | null;
  startDateTime: string;
  durationMinutes: number;
  timezone: string;
  capacity: number | null;
  registeredCount: number;
  price: string | number;
  currency: string;
  visibility: "PUBLIC" | "UNLISTED";
  createdAt: string;
  space: { id: string; name: string; slug: string } | null;
  creator: AdminSessionCreator;
  _count: { registrations: number };
  sales: AdminSessionSales;
}

export interface AdminSessionListResponse {
  sessions: AdminSession[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface AdminSessionAttendee {
  id: string;
  status: string;
  paymentStatus: string;
  totalAmount: string | number;
  refundedAmount: string | number;
  joinedAt: string | null;
  registeredAt: string;
  user: {
    id: string;
    fullName: string | null;
    username: string | null;
    mobileNumber: string | null;
    email: string | null;
  };
}

export interface AdminSessionDetail extends AdminSession {
  description: string | null;
  meetingUrl: string | null;
  recordingUrl: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  attendees: AdminSessionAttendee[];
}

/** Admin: all sessions. `GET /admin/sessions`. */
export async function getAllSessionsAdmin(params?: {
  page?: number;
  limit?: number;
  status?: AdminSessionStatus;
  search?: string;
}): Promise<{ data: AdminSessionListResponse | null; error: ApiError | null }> {
  return apiCall<AdminSessionListResponse>(
    backendClient.get("/admin/sessions", { params })
  );
}

/** Admin: one session with attendees. `GET /admin/sessions/:id`. */
export async function getSessionDetailAdmin(
  id: string
): Promise<{ data: AdminSessionDetail | null; error: ApiError | null }> {
  return apiCall<AdminSessionDetail>(
    backendClient.get(`/admin/sessions/${id}`)
  );
}
