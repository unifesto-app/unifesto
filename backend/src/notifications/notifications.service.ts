import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PushLogStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OneSignalService } from './onesignal.service';
import { NotificationCategory } from './notifications.constants';

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
    try {
      const unique = [...new Set(userIds)].filter(Boolean);
      if (unique.length === 0) return summary;

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

      if (skipped.length) {
        await this.logMany(skipped, opts.category, PushLogStatus.SKIPPED_PREF, opts.campaignId);
        summary.skipped += skipped.length;
      }
      if (allowed.length === 0) return summary;

      const data = {
        ...(opts.data ?? {}),
        ...(opts.deepLink ? { deepLink: opts.deepLink } : {}),
      };

      for (let i = 0; i < allowed.length; i += SEND_BATCH_SIZE) {
        const batch = allowed.slice(i, i + SEND_BATCH_SIZE);
        const result = await this.oneSignal.send({
          externalIds: batch,
          title: opts.title,
          body: opts.body,
          data,
        });
        const status = result.id ? PushLogStatus.SENT : PushLogStatus.FAILED;
        await this.logMany(batch, opts.category, status, opts.campaignId, result.id, result.error);
        if (result.id) summary.sent += batch.length;
        else summary.failed += batch.length;
      }
    } catch (err: any) {
      // Swallow — this path must never surface into a domain request.
      this.logger.error(`notifications.send failed: ${err?.message ?? err}`);
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
   * the device out of the segment. No per-user PushLog rows are written; the
   * returned `sent` is OneSignal's estimated recipient count.
   */
  async sendToSegments(
    segments: string[],
    opts: { title: string; body: string; data?: Record<string, unknown>; deepLink?: string },
  ): Promise<SendSummary> {
    const summary: SendSummary = { sent: 0, failed: 0, skipped: 0 };
    try {
      const data = {
        ...(opts.data ?? {}),
        ...(opts.deepLink ? { deepLink: opts.deepLink } : {}),
      };
      const result = await this.oneSignal.send({
        includedSegments: segments,
        title: opts.title,
        body: opts.body,
        data,
      });
      if (result.id) {
        summary.sent = result.recipients ?? 0;
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
          title: opts.title,
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
