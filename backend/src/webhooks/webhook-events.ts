import type { WebhookType } from './webhook-delivery.util';

/**
 * K23: the in-process event a registration's state change emits, after its
 * write has committed. WebhooksService turns it into deliveries for the
 * space's webhooks. Emitters import only this file, so no module cycles.
 */
export const WEBHOOK_EVENT = 'webhook.registration';

export interface WebhookEventPayload {
  type: WebhookType;
  registrationId: string;
}

/** Fire and forget: a webhook problem never fails the registration. */
export function emitWebhook(
  events: { emit(event: string, payload: WebhookEventPayload): unknown } | undefined | null,
  type: WebhookType,
  registrationId: string,
): void {
  try {
    events?.emit(WEBHOOK_EVENT, { type, registrationId });
  } catch {
    // The listener reports its own failures (common/on-event.ts).
  }
}
