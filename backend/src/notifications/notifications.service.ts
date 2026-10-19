import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MessageChannel, MessageDeliveryStatus, Prisma, PushLogStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OneSignalService } from './onesignal.service';
import { NotificationCategory } from './notifications.constants';
import {
  AttemptResult,
  DeliveryMeta,
  claimDelivery,
  finishDelivery,
  logDeliveries,
  withRetry,
} from './message-delivery';

export interface SendOptions {
  category: NotificationCategory;
  title: string;
  body: string;
  /** Extra OneSignal data payload; `deepLink` is merged in from `deepLink`. */
  data?: Record<string, unknown>;
  deepLink?: string;
  /** Set for campaign fan-out; null/undefined for transactional pushes. */
  campaignId?: string;
  /**
   * The in-app copy (`user_notifications`, the bell on Home). On by default:
   * type falls back to `data.type` (else the category) and eventId to
   * `data.eventId`. Written before the push-preference check, so someone with
   * push off still sees it. Pass `false` to skip it.
   */
  inbox?: { type: string; eventId?: string | null } | false;
  /**
   * Idempotency key (C3), single-recipient sends only (ignored otherwise).
   * Already sent ⇒ nothing happens, not even the inbox copy, and the summary
   * reports it as sent.
   */
  dedupKey?: string;
  /** Delivery-log kind; defaults to the category. */
  kind?: string;
  /**
   * Write the in-app copy only: no device push, no delivery row, dedupKey
   * ignored. For a notice whose buzz another push already gives.
   */
  inboxOnly?: boolean;
}

export interface SendSummary {
  sent: number;
  failed: number;
  skipped: number;
}

// OneSignal caps aliases per request; chunk large fan-outs (broadcasts) so one
// request never carries the whole user base.
const SEND_BATCH_SIZE = 2000;

// Opt-IN categories: off by default, so a user with no NotificationSettings row
// is NOT sent these until they explicitly enable them. Everything else is opt-out
// (on by default). Mirrors the Prisma schema @default values.
const OPT_IN_CATEGORIES: ReadonlySet<NotificationCategory> = new Set(['promotions']);

// Staff-only categories have no NotificationSettings column: only the global
// `pushEnabled` switch applies, so an admin can't silently lose ops alerts.
const STAFF_CATEGORIES: ReadonlySet<NotificationCategory> = new Set(['adminAlerts']);

// No NotificationSettings column: only `pushEnabled` applies. Staff alerts, and
// support replies the person is waiting on.
const NO_COLUMN_CATEGORIES: ReadonlySet<NotificationCategory> = new Set(['adminAlerts', 'support']);

// Category defaults for users with no NotificationSettings row yet.
function isCategoryAllowedByDefault(category: NotificationCategory): boolean {
  return !OPT_IN_CATEGORIES.has(category);
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oneSignal: OneSignalService,
  ) {}

  /**
   * Pref-aware fan-out to a set of users.
   *
   * For each user: skip (and log SKIPPED_PREF) unless `pushEnabled` AND the
   * category switch are on. Allowed users are sent in a single OneSignal request
   * and each gets a PushLog row (SENT/FAILED).
   *
   * Best-effort: never throws. Callers run off the domain request path (event
   * bus / scheduler), so a push failure can never break a registration
   * (risk N5).
   */
  async send(userIds: string[], opts: SendOptions): Promise<SendSummary> {
    const summary: SendSummary = { sent: 0, failed: 0, skipped: 0 };
    // Dedup (C3) is per message, so only for one recipient.
    let claimed = false;
    let claimedUser = '';
    try {
      const unique = [...new Set(userIds)].filter(Boolean);
      if (unique.length === 0) return summary;

      if (opts.dedupKey && unique.length === 1 && !opts.inboxOnly) {
        const claim = await claimDelivery(this.prisma, this.deliveryMeta(unique[0], opts));
        if (claim === 'skip') {
          summary.sent = 1;
          return summary;
        }
        claimed = claim === 'claimed';
        claimedUser = unique[0];
      }

      const settings = await this.prisma.notificationSettings.findMany({
        where: { userId: { in: unique } },
      });
      const byUser = new Map(settings.map((s) => [s.userId, s]));

      const allowed: string[] = [];
      const skipped: string[] = [];
      for (const userId of unique) {
        (this.isAllowed(byUser.get(userId), opts.category) ? allowed : skipped).push(userId);
      }

      // Staff alerts stay out of the feed; opt-in marketing only reaches those who opted in.
      if (opts.inbox !== false && !STAFF_CATEGORIES.has(opts.category)) {
        await this.writeInbox(OPT_IN_CATEGORIES.has(opts.category) ? allowed : unique, opts);
      }
      if (opts.inboxOnly) {
        summary.skipped = unique.length;
        return summary;
      }

      if (skipped.length) {
        await this.logMany(skipped, opts.category, PushLogStatus.SKIPPED_PREF, opts.campaignId);
        await this.logDeliveries(skipped, opts, claimed, MessageDeliveryStatus.SKIPPED);
        summary.skipped += skipped.length;
      }
      if (allowed.length === 0) return summary;

      const data = {
        ...(opts.data ?? {}),
        ...(opts.deepLink ? { deepLink: opts.deepLink } : {}),
      };

      for (let i = 0; i < allowed.length; i += SEND_BATCH_SIZE) {
        const batch = allowed.slice(i, i + SEND_BATCH_SIZE);
        // Same key on every retry: OneSignal drops the duplicate.
        const idempotencyKey = randomUUID();
        const { result, attempts } = await withRetry(() =>
          this.oneSignal.send({ externalIds: batch, title: opts.title, body: opts.body, data, idempotencyKey }),
        );
        const status = result.id ? PushLogStatus.SENT : PushLogStatus.FAILED;
        await this.logMany(batch, opts.category, status, opts.campaignId, result.id, result.error);
        await this.logDeliveries(
          batch,
          opts,
          claimed,
          result.id ? MessageDeliveryStatus.SENT : MessageDeliveryStatus.FAILED,
          result,
          attempts,
        );
        if (result.id) summary.sent += batch.length;
        else summary.failed += batch.length;
      }
      claimed = false; // finished above
    } catch (err: any) {
      // Swallow — this path must never surface into a domain request.
      this.logger.error(`notifications.send failed: ${err?.message ?? err}`);
      // Don't leave a claimed dedup row QUEUED (it would block retries for 10 min).
      if (claimed) {
        await finishDelivery(this.prisma, this.deliveryMeta(claimedUser, opts), true, MessageDeliveryStatus.FAILED, {
          id: null,
          error: String(err?.message ?? err),
        });
      }
    }
    return summary;
  }

  /**
   * Broadcast to OneSignal segment(s) (e.g. "Subscribed Users") — the all-users
   * fallback that reaches every subscribed device regardless of external_id
   * linkage, so unlinked devices still get the announcement.
   *
   * By nature this CANNOT apply per-user DB opt-out (no user list is enumerated),
   * so callers MUST restrict it to opt-out categories (never opt-in marketing).
   * Devices whose owner turned push off in-app are already excluded — that opts
   * the device out of the segment. No per-user PushLog rows are written, and
   * OneSignal's create response has no recipient count: `sent` stays 0 and the
   * caller keeps `oneSignalId` to read the real numbers back later
   * (OneSignalService.getDeliveryStats).
   */
  async sendToSegments(
    segments: string[],
    opts: { title: string; body: string; data?: Record<string, unknown>; deepLink?: string },
  ): Promise<SendSummary & { oneSignalId: string | null }> {
    const summary = { sent: 0, failed: 0, skipped: 0, oneSignalId: null as string | null };
    try {
      const data = {
        ...(opts.data ?? {}),
        ...(opts.deepLink ? { deepLink: opts.deepLink } : {}),
      };
      const idempotencyKey = randomUUID();
      const { result, attempts } = await withRetry(() =>
        this.oneSignal.send({ includedSegments: segments, title: opts.title, body: opts.body, data, idempotencyKey }),
      );
      // No user list for a segment: one row, recipient = the segment name(s).
      await finishDelivery(
        this.prisma,
        { channel: MessageChannel.PUSH, provider: 'onesignal', kind: 'broadcast', label: opts.title, recipient: segments.join(',') },
        false,
        result.id ? MessageDeliveryStatus.SENT : MessageDeliveryStatus.FAILED,
        result,
        attempts,
      );
      if (result.id) {
        summary.oneSignalId = result.id;
      } else {
        this.logger.error(`sendToSegments got no notification id: ${result.error ?? 'unknown'}`);
      }
    } catch (err: any) {
      this.logger.error(`notifications.sendToSegments failed: ${err?.message ?? err}`);
    }
    return summary;
  }

  /** The in-app copy. Its own try so a failed insert never costs the push. */
  private async writeInbox(userIds: string[], opts: SendOptions): Promise<void> {
    if (!userIds.length) return;
    const inbox = opts.inbox || undefined;
    const type = inbox?.type ?? (typeof opts.data?.type === 'string' ? opts.data.type : opts.category);
    const dataEventId = typeof opts.data?.eventId === 'string' ? opts.data.eventId : null;
    try {
      await this.prisma.userNotification.createMany({
        data: userIds.map((userId) => ({
          userId,
          eventId: inbox?.eventId ?? dataEventId,
          type: type.slice(0, 40),
          title: opts.title.slice(0, 200), // VarChar(200); a longer title failed the whole insert
          body: opts.body,
          deepLink: opts.deepLink ?? null,
          data: (opts.data ?? undefined) as Prisma.InputJsonValue | undefined,
        })),
      });
    } catch (err: any) {
      this.logger.warn(`Failed to write in-app notifications: ${err?.message ?? err}`);
    }
  }

  /** How many of `userIds` the pref filter in `send` would let through right now. */
  async countAllowed(userIds: string[], category: NotificationCategory): Promise<number> {
    const unique = [...new Set(userIds)].filter(Boolean);
    if (unique.length === 0) return 0;
    const settings = await this.prisma.notificationSettings.findMany({
      where: { userId: { in: unique } },
    });
    const byUser = new Map(settings.map((s) => [s.userId, s]));
    return unique.filter((id) => this.isAllowed(byUser.get(id), category)).length;
  }

  private isAllowed(
    settings: { pushEnabled: boolean; [k: string]: any } | undefined,
    category: NotificationCategory,
  ): boolean {
    if (!settings) return isCategoryAllowedByDefault(category);
    if (!settings.pushEnabled) return false;
    if (NO_COLUMN_CATEGORIES.has(category)) return true;
    return !!settings[category];
  }

  private deliveryMeta(userId: string, opts: SendOptions): DeliveryMeta {
    return {
      channel: MessageChannel.PUSH,
      provider: 'onesignal',
      kind: opts.kind ?? opts.category,
      label: opts.title,
      recipient: userId,
      userId,
      dedupKey: opts.dedupKey,
    };
  }

  /**
   * message_deliveries rows for a push batch (C3), next to PushLog: push shows
   * up in the same per-user history query as email and WhatsApp. A claimed
   * dedup row (single recipient) is updated instead of inserted.
   */
  private async logDeliveries(
    userIds: string[],
    opts: SendOptions,
    claimed: boolean,
    status: MessageDeliveryStatus,
    result?: AttemptResult,
    attempts = 0,
  ): Promise<void> {
    if (claimed) {
      await finishDelivery(this.prisma, this.deliveryMeta(userIds[0], opts), true, status, result, attempts);
      return;
    }
    await logDeliveries(
      this.prisma,
      userIds.map((userId) => {
        const { dedupKey: _ignored, ...meta } = this.deliveryMeta(userId, opts);
        return {
          ...meta,
          label: meta.label.slice(0, 255),
          kind: meta.kind?.slice(0, 64),
          status,
          providerMessageId: result?.id ?? null,
          error: result?.id ? null : (result?.error ?? null),
          attempts,
        };
      }),
    );
  }

  private async logMany(
    userIds: string[],
    category: NotificationCategory,
    status: PushLogStatus,
    campaignId?: string,
    oneSignalId?: string | null,
    error?: string,
  ): Promise<void> {
    try {
      await this.prisma.pushLog.createMany({
        data: userIds.map((userId) => ({
          userId,
          category,
          status,
          campaignId: campaignId ?? null,
          oneSignalId: oneSignalId ?? null,
          error: error ?? null,
        })),
        // Campaign rows are deduped by the @@unique([campaignId, userId]) index;
        // transactional rows (campaignId null) are never deduped by Postgres.
        skipDuplicates: true,
      });
    } catch (err: any) {
      this.logger.warn(`Failed to write PushLog rows: ${err?.message ?? err}`);
    }
  }
}
