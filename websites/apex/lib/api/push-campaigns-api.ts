/**
 * Push campaigns API — admin broadcast console over the NestJS
 * `/admin/push/campaigns` routes (ADMIN only). Compose / schedule / target /
 * monitor push campaigns; delivery is pref-aware server-side (opt-outs honoured).
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type PushScope = "PLATFORM" | "EVENT";
export type PushCampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "SENDING"
  | "SENT"
  | "FAILED"
  | "CANCELLED";

export interface PushCampaign {
  id: string;
  scope: PushScope;
  eventId: string | null;
  createdById: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  category: string;
  targetSegment: PushTarget;
  status: PushCampaignStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PushTarget {
  type: "all" | "event" | "space" | "users";
  eventId?: string;
  spaceId?: string;
  /** `users` target: hand-picked accounts (max 100). */
  userIds?: string[];
}

/**
 * Admin-selectable delivery category:
 *  - `productUpdates` — app/product announcements, opt-OUT (reaches everyone who
 *    hasn't disabled it). Default.
 *  - `promotions` — marketing, opt-IN (reaches only users who enabled it).
 */
export type PushBroadcastCategory = "productUpdates" | "promotions";

export interface CreatePushBroadcast {
  title: string;
  body: string;
  target: PushTarget;
  category?: PushBroadcastCategory;
  deepLink?: string;
  data?: Record<string, unknown>;
  scheduledAt?: string;
}

export interface PushCampaignListResponse {
  items: PushCampaign[];
  total: number;
  page: number;
  limit: number;
}

/** `POST /admin/push/campaigns`. No `scheduledAt` → sends immediately. */
export async function createPushBroadcast(
  payload: CreatePushBroadcast
): Promise<{ data: PushCampaign | null; error: ApiError | null }> {
  return apiCall<PushCampaign>(
    backendClient.post("/admin/push/campaigns", payload)
  );
}

/** `GET /admin/push/campaigns`. */
export async function listPushCampaigns(params?: {
  page?: number;
  limit?: number;
  status?: PushCampaignStatus[];
}): Promise<{ data: PushCampaignListResponse | null; error: ApiError | null }> {
  return apiCall<PushCampaignListResponse>(
    backendClient.get("/admin/push/campaigns", { params })
  );
}

/** `POST /admin/push/campaigns/:id/send` — re-trigger a DRAFT/SCHEDULED campaign now. */
export async function sendPushCampaign(
  id: string
): Promise<{ data: { status: string } | null; error: ApiError | null }> {
  return apiCall<{ status: string }>(
    backendClient.post(`/admin/push/campaigns/${id}/send`)
  );
}

/** `POST /admin/push/campaigns/:id/cancel` — cancel a not-yet-sent campaign. */
export async function cancelPushCampaign(
  id: string
): Promise<{ data: { status: string } | null; error: ApiError | null }> {
  return apiCall<{ status: string }>(
    backendClient.post(`/admin/push/campaigns/${id}/cancel`)
  );
}
