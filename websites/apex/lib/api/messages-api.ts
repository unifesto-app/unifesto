/**
 * Message delivery log (C6): every push, email and WhatsApp message the
 * backend sent or skipped, plus the email suppression list. Backed by
 * `/admin/messages` and `/admin/email-suppressions`.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type MessageChannel = "PUSH" | "EMAIL" | "WHATSAPP";
export type MessageStatus =
  | "QUEUED"
  | "SENT"
  | "DELIVERED"
  | "OPENED"
  | "FAILED"
  | "SKIPPED"
  | "SUPPRESSED";

export interface MessageDelivery {
  id: string;
  channel: MessageChannel;
  provider: string;
  kind: string | null;
  label: string;
  recipient: string;
  userId: string | null;
  status: MessageStatus;
  providerMessageId: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  deliveredAt: string | null;
  openedAt: string | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface MessageStats {
  days: number;
  counts: { channel: MessageChannel; status: MessageStatus; count: number }[];
  topFailingKinds: { kind: string | null; count: number }[];
  topErrors: { error: string | null; count: number }[];
  suppressions: number;
}

export interface EmailSuppression {
  id: string;
  address: string;
  reason: "BOUNCE" | "COMPLAINT" | "MANUAL";
  source: string;
  details: string | null;
  createdAt: string;
}

export interface ListMessagesParams {
  userId?: string;
  recipient?: string;
  channel?: MessageChannel;
  /** One status or a comma list. */
  status?: string;
  kind?: string;
  cursor?: string;
}

type Result<T> = { data: T | null; error: ApiError | null };

function qs(params: object) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function getMessages(params: ListMessagesParams = {}): Promise<Result<Page<MessageDelivery>>> {
  return apiCall(backendClient.get(`/admin/messages${qs(params)}`));
}

export function getMessageStats(days = 7): Promise<Result<MessageStats>> {
  return apiCall(backendClient.get(`/admin/messages/stats?days=${days}`));
}

export function getSuppressions(params: { search?: string; cursor?: string } = {}): Promise<Result<Page<EmailSuppression>>> {
  return apiCall(backendClient.get(`/admin/email-suppressions${qs(params)}`));
}

export function addSuppression(address: string): Promise<Result<EmailSuppression>> {
  return apiCall(backendClient.post("/admin/email-suppressions", { address }));
}

export function removeSuppression(id: string): Promise<Result<{ removed: boolean }>> {
  return apiCall(backendClient.delete(`/admin/email-suppressions/${id}`));
}

/** Badge tone for a delivery status. */
export function messageStatusTone(
  status: MessageStatus
): "success" | "warning" | "destructive" | "neutral" | "brand" {
  switch (status) {
    case "DELIVERED":
    case "OPENED":
      return "success";
    case "SENT":
      return "brand";
    case "FAILED":
      return "destructive";
    case "SUPPRESSED":
      return "warning";
    default:
      return "neutral";
  }
}
