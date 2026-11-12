/**
 * K23: a space's webhooks (console › Settings › API).
 * Space Admins only (`space:manage-integrations`).
 */
import backendClient, { apiCall, ApiError } from "./backend-client";

export const WEBHOOK_EVENTS = [
  { type: "registration.confirmed", label: "Booking confirmed" },
  { type: "registration.cancelled", label: "Booking cancelled" },
  { type: "registration.checked_in", label: "Checked in" },
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number]["type"];

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEventType[];
  isActive: boolean;
  failureCount: number;
  /** Switched off after too many failed deliveries in a row. */
  disabledAt: string | null;
  createdAt: string;
}

/** Only in the create response: the signing secret, shown once. */
export type NewWebhook = Webhook & { secret: string };

export interface WebhookDelivery {
  id: string;
  type: string;
  registrationId: string | null;
  status: "PENDING" | "DELIVERED" | "FAILED" | "SKIPPED";
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  durationMs: number | null;
  createdAt: string;
  deliveredAt: string | null;
}

type Result<T> = Promise<{ data: T | null; error: ApiError | null }>;
const base = (spaceId: string) => `/spaces/${spaceId}/webhooks`;

export const listWebhooks = (spaceId: string): Result<{ enabled: boolean; webhooks: Webhook[] }> =>
  apiCall(backendClient.get(base(spaceId)));

export const createWebhook = (spaceId: string, body: { url: string; events: WebhookEventType[] }): Result<NewWebhook> =>
  apiCall(backendClient.post(base(spaceId), body));

export const updateWebhook = (
  spaceId: string,
  id: string,
  body: { url?: string; events?: WebhookEventType[]; isActive?: boolean },
): Result<Webhook> => apiCall(backendClient.patch(`${base(spaceId)}/${id}`, body));

export const deleteWebhook = (spaceId: string, id: string): Result<{ deleted: boolean }> =>
  apiCall(backendClient.delete(`${base(spaceId)}/${id}`));

export const listDeliveries = (spaceId: string, id: string): Result<WebhookDelivery[]> =>
  apiCall(backendClient.get(`${base(spaceId)}/${id}/deliveries`));

export const sendTestWebhook = (
  spaceId: string,
  id: string,
): Result<Pick<WebhookDelivery, "id" | "status" | "lastStatusCode" | "lastError" | "durationMs">> =>
  apiCall(backendClient.post(`${base(spaceId)}/${id}/test`));

export const resendDelivery = (spaceId: string, id: string, deliveryId: string): Result<{ queued: boolean }> =>
  apiCall(backendClient.post(`${base(spaceId)}/${id}/deliveries/${deliveryId}/resend`));
