/**
 * WhatsApp inbox API — admin-only.
 *
 * Backed by the NestJS `/admin/whatsapp` controller. Lists the conversations
 * the WhatsApp Business number has received, opens a thread, and sends a
 * free-form reply (allowed only inside Meta's 24h customer-service window).
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type WhatsappDirection = "INBOUND" | "OUTBOUND";

export interface WhatsappMessage {
  id: string;
  conversationId: string;
  direction: WhatsappDirection;
  waMessageId: string | null;
  type: string;
  body: string | null;
  mediaNote: string | null;
  /** S3 URL for image/sticker inbound, rendered inline; null otherwise. */
  mediaUrl: string | null;
  sentById: string | null;
  status: string | null;
  errorText: string | null;
  createdAt: string;
}

export interface WhatsappConversation {
  id: string;
  waId: string;
  profileName: string | null;
  userId: string | null;
  lastInboundAt: string | null;
  lastMessageAt: string;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
  /** Whether a free-form reply is allowed right now (24h window open). */
  replyWindowOpen: boolean;
  /** Present on list rows: the single most recent message (for a preview). */
  messages?: WhatsappMessage[];
}

export interface WhatsappConversationsResponse {
  conversations: WhatsappConversation[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface WhatsappInboxStats {
  conversations: number;
  unread: number;
  openWindows: number;
}

export interface ListConversationsParams {
  search?: string;
  page?: number;
  limit?: number;
}

type Result<T> = { data: T | null; error: ApiError | null };

/** `GET /admin/whatsapp/stats` — inbox headline counters. */
export async function getWhatsappStats(): Promise<Result<WhatsappInboxStats>> {
  return apiCall<WhatsappInboxStats>(backendClient.get("/admin/whatsapp/stats"));
}

/** `GET /admin/whatsapp/conversations` — paginated inbox, newest first. */
export async function listWhatsappConversations(
  params: ListConversationsParams = {}
): Promise<Result<WhatsappConversationsResponse>> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  const qs = query.toString();
  return apiCall<WhatsappConversationsResponse>(
    backendClient.get(`/admin/whatsapp/conversations${qs ? `?${qs}` : ""}`)
  );
}

/** `GET /admin/whatsapp/conversations/:id` — full thread (marks it read). */
export async function getWhatsappConversation(
  id: string
): Promise<Result<WhatsappConversation>> {
  return apiCall<WhatsappConversation>(
    backendClient.get(`/admin/whatsapp/conversations/${id}`)
  );
}

/** `POST /admin/whatsapp/conversations/:id/reply` — send a free-form reply. */
export async function replyToWhatsappConversation(
  id: string,
  body: string
): Promise<Result<{ id: string; status: string }>> {
  return apiCall<{ id: string; status: string }>(
    backendClient.post(`/admin/whatsapp/conversations/${id}/reply`, { body })
  );
}

/**
 * `POST /admin/whatsapp/conversations/:id/media` — send an attachment
 * (image / video / audio / document) with an optional caption. Multipart upload;
 * only allowed inside the 24h reply window, same as a text reply.
 */
export async function sendWhatsappMedia(
  id: string,
  file: File,
  caption?: string
): Promise<Result<{ id: string; status: string }>> {
  const formData = new FormData();
  formData.append("file", file);
  if (caption?.trim()) formData.append("caption", caption.trim());
  return apiCall<{ id: string; status: string }>(
    backendClient.post(`/admin/whatsapp/conversations/${id}/media`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  );
}

export interface WhatsappTemplate {
  name: string;
  language: string;
  status: string;
  category: string;
  bodyText: string | null;
  bodyParamCount: number;
  needsMediaHeader: boolean;
}

/**
 * `GET /admin/whatsapp/templates` — approved Meta message templates, for the
 * "start a conversation" picker. Each carries its body-param count so the UI can
 * prompt for exactly the right number of values.
 */
export async function listWhatsappTemplates(): Promise<Result<WhatsappTemplate[]>> {
  return apiCall<WhatsappTemplate[]>(backendClient.get("/admin/whatsapp/templates"));
}

export interface InitiateConversationParams {
  to: string;
  templateName: string;
  bodyParams?: string[];
  languageCode?: string;
}

/**
 * `POST /admin/whatsapp/conversations/initiate` — start a new conversation by
 * sending a pre-approved template (the only way to reach someone outside the 24h
 * window). Returns the created conversation id so the caller can open it.
 */
export async function initiateWhatsappConversation(
  params: InitiateConversationParams
): Promise<Result<{ id: string; conversationId: string; status: string }>> {
  return apiCall<{ id: string; conversationId: string; status: string }>(
    backendClient.post("/admin/whatsapp/conversations/initiate", params)
  );
}

/* -------------------------------------------------------------------------- */
/* Broadcast (admin → many users)                                             */
/* -------------------------------------------------------------------------- */

export type BroadcastAudience = "ALL" | "SPACE" | "USER";

export interface BroadcastSpace {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
}

export interface BroadcastUser {
  id: string;
  name: string;
  username: string | null;
  mobileMasked: string;
}

export interface BroadcastParams {
  audience: BroadcastAudience;
  spaceId?: string;
  userIds?: string[];
  templateName: string;
  bodyParams?: string[];
  languageCode?: string;
}

export interface BroadcastResult {
  audience: BroadcastAudience;
  recipientCount: number;
  status: "started";
}

/** `GET /admin/whatsapp/broadcast/spaces` — spaces + member counts. */
export async function listBroadcastSpaces(): Promise<Result<BroadcastSpace[]>> {
  return apiCall<BroadcastSpace[]>(
    backendClient.get("/admin/whatsapp/broadcast/spaces")
  );
}

/** `GET /admin/whatsapp/broadcast/users?search=` — user typeahead. */
export async function searchBroadcastUsers(
  search: string
): Promise<Result<BroadcastUser[]>> {
  const qs = new URLSearchParams({ search }).toString();
  return apiCall<BroadcastUser[]>(
    backendClient.get(`/admin/whatsapp/broadcast/users?${qs}`)
  );
}

/**
 * `POST /admin/whatsapp/broadcast` — send an approved template to the chosen
 * audience. Returns the resolved recipient count; delivery runs server-side.
 */
export async function sendWhatsappBroadcast(
  params: BroadcastParams
): Promise<Result<BroadcastResult>> {
  return apiCall<BroadcastResult>(
    backendClient.post("/admin/whatsapp/broadcast", params)
  );
}

/* -------------------------------------------------------------------------- */
/* Display helpers                                                            */
/* -------------------------------------------------------------------------- */

/** A human label for a conversation: profile name, else the +number. */
export function conversationName(c: WhatsappConversation): string {
  return c.profileName || `+${c.waId}`;
}

/** Emoji + label for a media message kind, used in list previews. */
const MEDIA_PREVIEW: Record<string, string> = {
  image: "📷 Photo",
  sticker: "🌟 Sticker",
  video: "🎥 Video",
  audio: "🎧 Audio",
  document: "📄 Document",
  location: "📍 Location",
  contacts: "👤 Contact",
};

/** A one-line preview of the latest message on a list row. */
export function messagePreview(m?: WhatsappMessage): string {
  if (!m) return "No messages yet";
  // Prefer the caption/body, then a friendly kind label, then the raw note.
  if (m.body) return m.body;
  const kind = MEDIA_PREVIEW[m.type];
  if (kind) return kind;
  if (m.mediaNote) return m.mediaNote;
  return `[${m.type}]`;
}
