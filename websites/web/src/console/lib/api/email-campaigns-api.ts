/**
 * Space email campaigns API — over the NestJS `/spaces/:spaceId/email/*` routes,
 * gated by `space:manage-email` (Space Admin + Curator). A space can email its
 * own members, an event's registrants or waitlist, or a single member — and
 * gets the same open/click tracking + A/B testing the platform console has.
 *
 * Every call takes `spaceId` explicitly; pages read it from `useSpaceId()`.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type EmailTargetType =
  | "SPACE_MEMBERS"
  | "EVENT_REGISTRANTS"
  | "WAITLIST"
  | "SINGLE_USER";

export type EmailCampaignStatus =
  | "PENDING"
  | "SENDING"
  | "SENT"
  | "FAILED"
  | "SCHEDULED"
  | "CANCELLED";

export type EmailLogStatus = "SENT" | "FAILED" | "BOUNCED";

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
  scheduledAt?: string;
}

export interface CampaignListResponse {
  data: EmailCampaign[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

const base = (spaceId: string) => `/spaces/${spaceId}/email`;

export async function createCampaign(
  spaceId: string,
  payload: CreateCampaignPayload
): Promise<{ data: { campaignId: string } | null; error: ApiError | null }> {
  return apiCall(backendClient.post(`${base(spaceId)}/campaigns`, payload));
}

export async function listCampaigns(
  spaceId: string,
  params?: { page?: number; limit?: number; search?: string }
): Promise<{ data: CampaignListResponse | null; error: ApiError | null }> {
  return apiCall<CampaignListResponse>(
    backendClient.get(`${base(spaceId)}/campaigns`, { params })
  );
}

export async function getCampaign(
  spaceId: string,
  id: string
): Promise<{ data: EmailCampaignDetail | null; error: ApiError | null }> {
  return apiCall<EmailCampaignDetail>(
    backendClient.get(`${base(spaceId)}/campaigns/${id}`)
  );
}

export async function cancelCampaign(
  spaceId: string,
  id: string
): Promise<{ data: { success: boolean } | null; error: ApiError | null }> {
  return apiCall(backendClient.post(`${base(spaceId)}/campaigns/${id}/cancel`));
}

export async function previewBody(
  spaceId: string,
  body: string
): Promise<{ data: { html: string } | null; error: ApiError | null }> {
  return apiCall<{ html: string }>(
    backendClient.post(`${base(spaceId)}/preview`, { body })
  );
}

/** People this target mails right now (opt-outs dropped), for the confirm step. */
export async function countAudience(
  spaceId: string,
  payload: Pick<CreateCampaignPayload, "targetType" | "targetId">
): Promise<{ data: { recipientCount: number } | null; error: ApiError | null }> {
  return apiCall(backendClient.post(`${base(spaceId)}/audience`, payload));
}

/** The draft to my own email only. */
export async function sendTestEmail(
  spaceId: string,
  payload: { subject: string; body: string }
): Promise<{ data: { sentTo: string } | null; error: ApiError | null }> {
  return apiCall(backendClient.post(`${base(spaceId)}/test`, payload));
}
