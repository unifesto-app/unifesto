/**
 * Campaigns API (C17): one message to push, in-app, email and WhatsApp over
 * the NestJS `/admin/campaigns` routes (ADMIN only). The backend resolves the
 * audience once and hands each channel to its own sender, so opt-outs, the
 * daily cap and tracking work exactly as on the single-channel pages.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

type Result<T> = Promise<{ data: T | null; error: ApiError | null }>;

/** push = push with its in-app copy; inapp = the in-app copy only. */
export type CampaignChannel = "push" | "inapp" | "email" | "whatsapp";
export type CampaignCategory = "productUpdates" | "promotions";
export type CampaignStatus = "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "FAILED" | "CANCELLED" | "HELD";

export interface CampaignAudience {
  type: "all" | "space" | "event" | "waitlist" | "organisers" | "staff" | "users";
  spaceId?: string;
  eventId?: string;
  /** `users`: hand-picked accounts (max 500). */
  userIds?: string[];
}

export interface CampaignContent {
  push?: { title: string; body: string; deepLink?: string };
  email?: { subject: string; html: string };
  whatsapp?: { templateName: string; languageCode?: string; bodyParams?: string[] };
}

export interface CampaignMessage extends CampaignContent {
  channels: CampaignChannel[];
  category?: CampaignCategory;
}

export interface CreateCampaign extends CampaignMessage {
  audience: CampaignAudience;
  /** ISO time; leave out to send now. */
  scheduledAt?: string;
  brief?: string;
}

/** message_deliveries rows by status per channel; in-app only is a count. */
export interface CampaignCounts {
  push?: Record<string, number>;
  email?: Record<string, number>;
  whatsapp?: Record<string, number>;
  inapp?: number;
}

export interface Campaign {
  id: string;
  channels: CampaignChannel[];
  category: CampaignCategory;
  audience: CampaignAudience;
  content: CampaignContent;
  status: CampaignStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  error: string | null;
  recipientCount: number;
  createdAt: string;
  counts: CampaignCounts;
}

export type ChannelReach = { audience: number } & Partial<Record<CampaignChannel, number>>;

/** `POST /admin/campaigns`: sends now (and answers once every channel is handed off) or schedules. */
export function createCampaign(payload: CreateCampaign): Result<Campaign> {
  return apiCall<Campaign>(backendClient.post("/admin/campaigns", payload));
}

/** `POST /admin/campaigns/audience`: who each chosen channel reaches now, after its opt-outs. */
export function countCampaignReach(
  payload: Pick<CreateCampaign, "audience" | "channels" | "category" | "whatsapp">
): Result<ChannelReach> {
  return apiCall<ChannelReach>(backendClient.post("/admin/campaigns/audience", payload));
}

/** `POST /admin/campaigns/test`: each chosen channel to the signed-in admin only. */
export function sendCampaignTest(payload: CampaignMessage): Result<{ sent: CampaignChannel[]; errors: string[] }> {
  return apiCall(backendClient.post("/admin/campaigns/test", payload));
}

export function listCampaigns(params: { page?: number; limit?: number } = {}): Result<{
  campaigns: Campaign[];
  total: number;
  page: number;
  limit: number;
}> {
  return apiCall(backendClient.get("/admin/campaigns", { params }));
}

export function cancelCampaign(id: string): Result<{ status: CampaignStatus }> {
  return apiCall(backendClient.post(`/admin/campaigns/${id}/cancel`));
}
