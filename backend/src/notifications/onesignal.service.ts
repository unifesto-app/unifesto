import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { isRetryableAxiosError } from './message-delivery';

export interface OneSignalSendParams {
  /**
   * Target by OneSignal external id (= user.id, set at login on device). Used
   * for enumerated, pref-filtered sends. Mutually exclusive with `includedSegments`.
   */
  externalIds?: string[];
  /**
   * Target by OneSignal segment name (e.g. "Subscribed Users"). Reaches every
   * subscribed device in the segment regardless of external_id linkage — used
   * for the all-users broadcast fallback. Takes precedence over `externalIds`.
   */
  includedSegments?: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /**
   * OneSignal `idempotency_key`: a repeat request with the same key (within
   * 30 days) returns the first notification instead of sending again, so a
   * retried timeout can't double-push.
   */
  idempotencyKey?: string;
  /** Deliver later instead of now (OneSignal `send_after`; quiet hours). */
  sendAfter?: Date;
}

/** OneSignal's 404 for a transfer to an external id that has no user yet. */
export function isMissingTargetUser(err: any): boolean {
  if (err?.response?.status !== 404) return false;
  return /target user does not exist/i.test(JSON.stringify(err?.response?.data ?? ''));
}

export interface OneSignalSendResult {
  /** OneSignal notification id when accepted, null on failure. */
  id: string | null;
  error?: string;
  /** Transient failure (network, timeout, 429, 5xx): worth retrying. */
  retryable?: boolean;
}

/**
 * Thin wrapper over the OneSignal REST `/notifications` endpoint. Server-only:
 * the REST API key never ships to the client (that's the SDK's app id, which is
 * public). Targets users by `external_id` alias so OneSignal handles multi-device
 * fan-out and logged-out aliases for us.
 */
@Injectable()
export class OneSignalService {
  private readonly logger = new Logger(OneSignalService.name);
  private readonly appId = process.env.ONESIGNAL_APP_ID;
  private readonly restApiKey = process.env.ONESIGNAL_REST_API_KEY;
  private readonly endpoint = 'https://api.onesignal.com/notifications';

  isConfigured(): boolean {
    return !!this.appId && !!this.restApiKey;
  }

  private get headers() {
    return {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Key ${this.restApiKey}`,
    };
  }

  private transferSubscription(subscriptionId: string, externalId: string) {
    return axios.patch(
      `https://api.onesignal.com/apps/${this.appId}/subscriptions/${encodeURIComponent(subscriptionId)}/owner`,
      { identity: { external_id: externalId } },
      { headers: this.headers, timeout: 10_000 },
    );
  }

  /** Create a OneSignal user for `externalId`. A 409 (it already exists) is fine. */
  private async createUser(externalId: string): Promise<void> {
    try {
      await axios.post(
        `https://api.onesignal.com/apps/${this.appId}/users`,
        { identity: { external_id: externalId } },
        { headers: this.headers, timeout: 10_000 },
      );
    } catch (err: any) {
      if (err?.response?.status !== 409) throw err;
    }
  }

  /**
   * Server-side identity link: make `externalId` the owner of this push
   * subscription (OneSignal "transfer subscription"). Same effect as the SDK's
   * `OneSignal.login(userId)`, but doesn't depend on the client getting it right.
   *
   * The transfer needs an existing OneSignal user with that external id. A new
   * account whose device never ran `login()` has none, and OneSignal answers
   * 404 "Target user does not exist"; then the user is created and the
   * transfer retried once. Best-effort: returns an error string instead of throwing.
   */
  async linkSubscriptionToExternalId(
    subscriptionId: string,
    externalId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'not_configured' };
    try {
      try {
        await this.transferSubscription(subscriptionId, externalId);
      } catch (err: any) {
        if (!isMissingTargetUser(err)) throw err;
        await this.createUser(externalId);
        await this.transferSubscription(subscriptionId, externalId);
      }
      return { ok: true };
    } catch (err: any) {
      const status = err?.response?.status;
      const detail =
        JSON.stringify(err?.response?.data?.errors ?? err?.response?.data ?? err?.message ?? 'unknown');
      this.logger.warn(`OneSignal link ${subscriptionId} failed (${status ?? 'network'}): ${detail}`);
      return { ok: false, error: status ? `${status}: ${detail}` : detail };
    }
  }

  /**
   * Delivery stats of one sent notification (GET /notifications/:id). The
   * create response has no recipient count, so a segment broadcast reads its
   * numbers back from here. `successful` = handed to Apple/Google; `failed` =
   * unsubscribed devices. Null when unknown (not configured, network, 404).
   */
  async getDeliveryStats(
    notificationId: string,
  ): Promise<{ successful: number; failed: number; errored: number } | null> {
    if (!this.isConfigured()) return null;
    try {
      const res = await axios.get(`${this.endpoint}/${encodeURIComponent(notificationId)}`, {
        params: { app_id: this.appId },
        headers: this.headers,
        timeout: 10_000,
      });
      const d = res.data ?? {};
      return { successful: d.successful ?? 0, failed: d.failed ?? 0, errored: d.errored ?? 0 };
    } catch (err: any) {
      this.logger.warn(`OneSignal stats ${notificationId} failed: ${err?.response?.status ?? err?.message}`);
      return null;
    }
  }

  /**
   * Send one push to a batch of external ids. Best-effort: returns a result
   * object rather than throwing, so callers (already off the request path) can
   * record SENT/FAILED without special-casing exceptions.
   */
  async send(params: OneSignalSendParams): Promise<OneSignalSendResult> {
    if (!this.isConfigured()) {
      this.logger.warn('OneSignal not configured (missing app id / REST key) — skipping send');
      return { id: null, error: 'not_configured' };
    }

    // Segment targeting reaches every subscribed device; alias targeting needs a
    // non-empty external_id list. Segment takes precedence when both are given.
    const useSegments = (params.includedSegments?.length ?? 0) > 0;
    if (!useSegments && (params.externalIds?.length ?? 0) === 0) {
      return { id: null, error: 'no_recipients' };
    }
    const targeting = useSegments
      ? { included_segments: params.includedSegments }
      : { target_channel: 'push', include_aliases: { external_id: params.externalIds } };

    try {
      const res = await axios.post(
        this.endpoint,
        {
          app_id: this.appId,
          ...targeting,
          headings: { en: params.title },
          contents: { en: params.body },
          ...(params.data ? { data: params.data } : {}),
          ...(params.idempotencyKey ? { idempotency_key: params.idempotencyKey } : {}),
          ...(params.sendAfter ? { send_after: params.sendAfter.toISOString() } : {}),
        },
        {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: `Key ${this.restApiKey}`,
          },
          timeout: 10_000,
        },
      );

      const data = res.data ?? {};
      // OneSignal returns 200 with `errors` populated for invalid/absent aliases.
      const invalidAliases = data?.errors?.invalid_aliases?.external_id;
      if (invalidAliases?.length) {
        this.logger.debug(
          `OneSignal: ${invalidAliases.length} external_id(s) had no subscription`,
        );
      }
      // A rejected send ALSO comes back 200: empty `id` + `errors` (e.g. unknown
      // segment, or "All included players are not subscribed" when no targeted
      // external_id is linked to a device). Surface it instead of a blank failure.
      if (!data.id) {
        const reason = Array.isArray(data.errors)
          ? data.errors.join(', ')
          : invalidAliases?.length
            ? 'no_linked_subscription'
            : JSON.stringify(data.errors ?? 'no_notification_id');
        this.logger.warn(`OneSignal accepted no notification: ${reason}`);
        return { id: null, error: reason };
      }
      return { id: data.id };
    } catch (err: any) {
      const detail =
        err?.response?.data?.errors?.join?.(', ') ||
        err?.response?.data?.errors ||
        err?.message ||
        'unknown';
      this.logger.error(`OneSignal send failed: ${detail}`);
      return { id: null, error: String(detail), retryable: isRetryableAxiosError(err, !!params.idempotencyKey) };
    }
  }
}
