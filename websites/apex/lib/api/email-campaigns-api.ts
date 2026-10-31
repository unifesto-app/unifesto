/**
 * Email campaigns API — platform (apex) console over the NestJS
 * `/admin/email/*` routes (ADMIN only). Compose / schedule / target / monitor
 * broadcast email, with open + click tracking and A/B subject testing.
 *
 * The space app has a parallel client hitting `/spaces/:spaceId/email/*`; the
 * wire types below are shared in spirit — keep them in step.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type EmailTargetType =
  | "SINGLE_USER"
  | "SPACE_MEMBERS"
  | "EVENT_REGISTRANTS"
  | "WAITLIST"
  | "ALL_USERS"
  | "ORGANISERS_ONLY"
  | "SEGMENT"
  | "STAFF";

export type EmailCampaignStatus =
  | "PENDING"
  | "SENDING"
  | "SENT"
  | "FAILED"
  | "SCHEDULED"
  | "CANCELLED";

export type EmailLogStatus = "SENT" | "FAILED" | "BOUNCED";

export interface SegmentFilters {
  plan?: string[];
  joinedAfter?: string;
  joinedBefore?: string;
  hasRegistrations?: boolean;
}

export interface EmailCampaign {
  id: string;
  spaceId: string | null;
  subject: string;
  subjectB: string | null;
  abSplitPct: number | null;
  body: string;
  templateId: string | null;
  targetType: EmailTargetType;
  targetId: string | null;
  segmentFilters: SegmentFilters | null;
  totalSent: number;
  failedCount: number;
  openCount: number;
  clickCount: number;
  status: EmailCampaignStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { logs: number };
}

export interface EmailCampaignLog {
  id: string;
  recipientEmail: string;
  userId: string | null;
  variant: string | null;
  status: EmailLogStatus;
  errorMessage: string | null;
  openedAt: string | null;
  firstClickedAt: string | null;
  openCount: number;
  clickCount: number;
  sentAt: string;
}

export interface AbVariantStats {
  sent: number;
  opens: number;
  clicks: number;
}

export interface EmailCampaignDetail extends EmailCampaign {
  logs: EmailCampaignLog[];
  stats: { a: AbVariantStats; b: AbVariantStats } | null;
}

export interface CreateCampaignPayload {
  targetType: EmailTargetType;
  targetId?: string;
  subject: string;
  subjectB?: string;
  abSplitPct?: number;
  body: string;
  templateId?: string;
  segmentFilters?: SegmentFilters;
  scheduledAt?: string;
}

export interface CampaignListResponse {
  data: EmailCampaign[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** `POST /admin/email/campaigns`. No `scheduledAt` → sends immediately. */
export async function createCampaign(
  payload: CreateCampaignPayload
): Promise<{ data: { campaignId: string } | null; error: ApiError | null }> {
  return apiCall(backendClient.post("/admin/email/campaigns", payload));
}

/** `GET /admin/email/campaigns`. */
export async function listCampaigns(params?: {
  page?: number;
  limit?: number;
}): Promise<{ data: CampaignListResponse | null; error: ApiError | null }> {
  return apiCall<CampaignListResponse>(
    backendClient.get("/admin/email/campaigns", { params })
  );
}

/** `GET /admin/email/campaigns/:id`. */
export async function getCampaign(
  id: string
): Promise<{ data: EmailCampaignDetail | null; error: ApiError | null }> {
  return apiCall<EmailCampaignDetail>(
    backendClient.get(`/admin/email/campaigns/${id}`)
  );
}

/** `POST /admin/email/campaigns/:id/cancel` — cancel a scheduled campaign. */
export async function cancelCampaign(
  id: string
): Promise<{ data: { success: boolean } | null; error: ApiError | null }> {
  return apiCall(backendClient.post(`/admin/email/campaigns/${id}/cancel`));
}

/** `POST /admin/email/preview` — render a body with sample merge values. */
export async function previewBody(
  body: string
): Promise<{ data: { html: string } | null; error: ApiError | null }> {
  return apiCall<{ html: string }>(
    backendClient.post("/admin/email/preview", { body })
  );
}

/** `POST /admin/email/audience`: people this target mails right now (opt-outs dropped). */
export async function countAudience(
  payload: Pick<CreateCampaignPayload, "targetType" | "targetId" | "segmentFilters">
): Promise<{ data: { recipientCount: number } | null; error: ApiError | null }> {
  return apiCall(backendClient.post("/admin/email/audience", payload));
}

/** `POST /admin/email/test`: the draft to my own email only. */
export async function sendTestEmail(payload: {
  subject: string;
  body: string;
}): Promise<{ data: { sentTo: string } | null; error: ApiError | null }> {
  return apiCall(backendClient.post("/admin/email/test", payload));
}
