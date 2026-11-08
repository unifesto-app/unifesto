/**
 * Space campaigns API (C17): one message as a push (with its in-app copy) or
 * an in-app notice, and an email, over `/spaces/:spaceId/campaigns` (gated by
 * `space:manage-email`) and `/events/:eventId/campaigns` (event managers).
 * Each channel keeps its own opt-outs; Unifesto checks the whole message
 * before it goes. WhatsApp is Unifesto's own channel, not a space's.
 *
 * Every call takes `spaceId` or `eventId` explicitly; pages read the space
 * from `useSpaceId()`.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

type Result<T> = Promise<{ data: T | null; error: ApiError | null }>;

/** push = push with its in-app copy; inapp = the in-app copy only. */
export type CampaignChannel = "push" | "inapp" | "email";
export type CampaignStatus = "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "FAILED" | "CANCELLED" | "HELD";

export interface CampaignAudience {
  /** not_checked_in: an event's attendees who haven't checked in yet, worked out when it sends. */
  type: "space" | "event" | "not_checked_in" | "waitlist" | "users";
  eventId?: string;
  userIds?: string[];
}

export interface CampaignMessage {
  channels: CampaignChannel[];
  push?: { title: string; body: string; deepLink?: string };
  email?: { subject: string; html: string };
}

export interface CreateCampaign extends CampaignMessage {
  audience: CampaignAudience;
  /** ISO time; leave out to send now. */
  scheduledAt?: string;
  /** Timed to the event instead: minutes from its start, negative before. Moves with the event. */
  offsetMinutes?: number;
  /** The line Write with AI drafted it from. */
  brief?: string;
}

/** What Write with AI hands back: words for the chosen channels, never a send. */
export type CampaignDraftResult =
  | {
      ok: true;
      draft: { push?: { title: string; body: string }; email?: { subject: string; html: string } };
      /** Channels left out because they quoted a fact the line and event never gave. */
      dropped?: string[];
    }
  | { ok: false; reason: "disabled" | "capped" | "refused" | "error" | "empty" | "held"; why?: string };

/** Haiku drafts the chosen channels from one line and the event's own facts. Uses one AI request. */
export function draftCampaign(
  spaceId: string,
  payload: { line: string; channels: CampaignChannel[]; eventId?: string }
): Result<CampaignDraftResult> {
  return apiCall<CampaignDraftResult>(backendClient.post(`/spaces/${spaceId}/campaigns/draft`, payload));
}

/** What to tell the organiser when a draft didn't come back. */
export function draftProblem(res: Extract<CampaignDraftResult, { ok: false }>): string {
  switch (res.reason) {
    case "disabled":
      return "Write with AI is off right now.";
    case "capped":
      return "That's today's drafts used up. Try again tomorrow.";
    case "held":
      return `The draft quoted something you didn't give (${res.why ?? "a detail"}). Add it to your line, or write it yourself.`;
    case "empty":
      return "There wasn't enough in your line to draft from. Say what's happening.";
    default:
      return "The draft didn't come through. Try again.";
  }
}

/** message_deliveries rows by status per channel; in-app only is a count. */
export interface CampaignCounts {
  push?: Record<string, number>;
  email?: Record<string, number>;
  inapp?: number;
}

export interface Campaign {
  id: string;
  eventId: string | null;
  channels: CampaignChannel[];
  audience: CampaignAudience;
  content: Pick<CampaignMessage, "push" | "email">;
  status: CampaignStatus;
  scheduledAt: string | null;
  offsetMinutes: number | null;
  sentAt: string | null;
  error: string | null;
  recipientCount: number;
  createdAt: string;
  counts: CampaignCounts;
}

export type ChannelReach = { audience: number } & Partial<Record<CampaignChannel, number>>;

export function listCampaigns(spaceId: string, params: { page?: number; limit?: number } = {}): Result<{
  campaigns: Campaign[];
  total: number;
  page: number;
  limit: number;
}> {
  return apiCall(backendClient.get(`/spaces/${spaceId}/campaigns`, { params }));
}

/** Sends now (answers once every channel is handed off) or schedules. */
export function createCampaign(spaceId: string, payload: CreateCampaign): Result<Campaign> {
  return apiCall<Campaign>(backendClient.post(`/spaces/${spaceId}/campaigns`, payload));
}

/** Who each chosen channel reaches now, after its opt-outs. */
export function countCampaignReach(
  spaceId: string,
  payload: Pick<CreateCampaign, "audience" | "channels">
): Result<ChannelReach> {
  return apiCall<ChannelReach>(backendClient.post(`/spaces/${spaceId}/campaigns/audience`, payload));
}

/** Each chosen channel to the signed-in organiser only. */
export function sendCampaignTest(
  spaceId: string,
  payload: CampaignMessage
): Result<{ sent: CampaignChannel[]; errors: string[] }> {
  return apiCall(backendClient.post(`/spaces/${spaceId}/campaigns/test`, payload));
}

export function cancelCampaign(spaceId: string, id: string): Result<{ status: CampaignStatus }> {
  return apiCall(backendClient.post(`/spaces/${spaceId}/campaigns/${id}/cancel`));
}

/**
 * An event's announcement as a campaign: to its attendees, as a push with its
 * in-app copy, plus an email when asked. Up to 3 per event a day.
 */
export function announceToEvent(eventId: string, payload: CreateCampaign): Result<Campaign> {
  return apiCall<Campaign>(backendClient.post(`/events/${eventId}/campaigns`, payload));
}
