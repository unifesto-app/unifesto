import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Queue, Worker } from 'bullmq';
import type Redis from 'ioredis';
import { MessageChannel, MessageDeliveryStatus, Prisma, PushLogStatus } from '@prisma/client';
import { inChunks } from '../common/batching';
import { reportError } from '../common/observability';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { OneSignalService } from './onesignal.service';
import { NotificationsGateway } from './notifications.gateway';
import { DirectDevice, PushMessage, PushSender, providerOf } from './push-sender';
import { NotificationCategory } from './notifications.constants';
import { quietHoursDeferral } from './quiet-hours';
import { canSend, OPT_IN_CATEGORIES } from './send-policy';
import {
  AttemptResult,
  DeliveryMeta,
  DeliveryProvider,
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
  /** Critical (notify() critical kinds): never held back by quiet hours. */
  urgent?: boolean;
  /**
   * Write the in-app copy only: no device push, no delivery row, dedupKey
   * ignored. For a notice whose buzz another push already gives.
   */
  inboxOnly?: boolean;
  /**
   * Native-push installs only, no OneSignal: the all-users broadcast, whose
   * OneSignal half already went to a segment.
   */
  directOnly?: boolean;
}

export interface SendSummary {
  sent: number;
  failed: number;
  skipped: number;
}

/** How one person's push went, and through which provider. */
interface Outcome {
  result: AttemptResult;
  attempts: number;
  provider: DeliveryProvider;
}

/** A user's native-push installs (C12), and whether OneSignal still has any of theirs. */
interface UserDevices {
  direct: DirectDevice[];
  /** Every install reports a token: their OneSignal subscriptions are gone, skip it. */
  movedOff: boolean;
  provider: DeliveryProvider;
}

interface DeferredPush {
  userIds: string[];
  msg: PushMessage;
}

// OneSignal caps aliases per request; chunk large fan-outs (broadcasts) so one
// request never carries the whole user base.
const SEND_BATCH_SIZE = 2000;

// HTTP/2 multiplexes these on one APNs connection.
const DIRECT_CONCURRENCY = 50;
const DEFERRED_QUEUE = 'push-deferred';

// Staff alerts stay out of the in-app feed.
const STAFF_CATEGORIES: ReadonlySet<NotificationCategory> = new Set(['adminAlerts']);

// Never held back by quiet hours (C4): tickets and payments someone is waiting
// on, hosts messaging live during an event, staff alerts, support replies.
// Critical notify() kinds pass `urgent`.
const NEVER_DEFER: ReadonlySet<NotificationCategory> = new Set([
  'registrationUpdates',
  'organiserAnnouncements',
  'adminAlerts',
  'support',
]);

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private deferred: Queue<DeferredPush> | null = null;
  private worker: Worker<DeferredPush> | null = null;
  private connections: Redis[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly oneSignal: OneSignalService,
    @Optional() private readonly pushSender?: PushSender,
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly gateway?: NotificationsGateway,
  ) {}

  /** Quiet hours for native push: a delayed job (OneSignal had send_after). */
  onModuleInit() {
    if (!this.pushSender?.isConfigured()) return;
    const queueConn = this.redis?.createClient();
    const workerConn = this.redis?.createClient();
    if (!queueConn || !workerConn) {
      queueConn?.disconnect();
      workerConn?.disconnect();
      return;
    }
    this.connections = [queueConn, workerConn];
    this.deferred = new Queue<DeferredPush>(DEFERRED_QUEUE, { connection: queueConn });
    this.worker = new Worker<DeferredPush>(
      DEFERRED_QUEUE,
      // Devices are read when it fires, so an install signed out meanwhile gets nothing.
      async (job) => {
        const devices = await this.devicesFor(job.data.userIds);
        await this.sendDirect([...devices.values()].flatMap((d) => d.direct), job.data.msg);
      },
      { connection: workerConn, concurrency: 2 },
    );
    this.worker.on('failed', (_job, err) => reportError(err, { queue: DEFERRED_QUEUE }));
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.deferred?.close();
    for (const c of this.connections) c.disconnect();
  }

  /**
   * Pref-aware fan-out to a set of users.
   *
   * For each user: skip (and log SKIPPED_PREF) unless canSend() lets it
   * through: `pushEnabled` AND the category switch on, and not over the daily
   * cap (C16, logged with error "daily cap"). Allowed users go out by native push (their
   * APNs/FCM installs) and/or one OneSignal request per batch, and each gets a
   * PushLog row (SENT/FAILED).
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

      const decision = await canSend(this.prisma, unique, {
        kind: opts.kind ?? opts.category,
        category: opts.category,
        channel: 'push',
        critical: opts.urgent,
      });
      const allowed = unique.filter((u) => decision.allowed.has(u));
      const capped = unique.filter((u) => decision.capped.has(u));
      const skipped = unique.filter((u) => !decision.allowed.has(u) && !decision.capped.has(u));

      // Staff alerts stay out of the feed; opt-in marketing only reaches those
      // who opted in. The cap holds back the push, not the in-app copy.
      if (opts.inbox !== false && !STAFF_CATEGORIES.has(opts.category)) {
        await this.writeInbox(OPT_IN_CATEGORIES.has(opts.category) ? [...allowed, ...capped] : unique, opts);
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
      if (capped.length) {
        const why = { id: null, error: 'daily cap' };
        await this.logMany(capped, opts.category, PushLogStatus.SKIPPED_PREF, opts.campaignId, null, why.error);
        await this.logDeliveries(capped, opts, claimed, MessageDeliveryStatus.SKIPPED, why);
        summary.skipped += capped.length;
      }
      if (allowed.length === 0) return summary;

      const data = {
        ...(opts.data ?? {}),
        ...(opts.deepLink ? { deepLink: opts.deepLink } : {}),
      };

      // Quiet hours (C4): one batch per delivery time; the inbox copy above is
      // already written.
      const now = new Date();
      const deferrable = !opts.urgent && !NEVER_DEFER.has(opts.category);
      const byUser = new Map(
        deferrable
          ? (await this.prisma.notificationSettings.findMany({ where: { userId: { in: allowed } } })).map((s) => [s.userId, s])
          : [],
      );
      const groups = new Map<number, string[]>(); // 0 = now
      for (const userId of allowed) {
        const s = byUser.get(userId);
        const at = deferrable ? quietHoursDeferral(now, s?.quietHoursStart, s?.quietHoursEnd)?.getTime() ?? 0 : 0;
        const group = groups.get(at);
        if (group) group.push(userId);
        else groups.set(at, [userId]);
      }

      const batches: Array<{ batch: string[]; sendAfter?: Date }> = [];
      for (const [at, group] of groups) {
        for (let i = 0; i < group.length; i += SEND_BATCH_SIZE) {
          batches.push({ batch: group.slice(i, i + SEND_BATCH_SIZE), sendAfter: at ? new Date(at) : undefined });
        }
      }

      // C12: installs on native push are sent directly. OneSignal still gets
      // everyone else by external_id until every install has moved (C20).
      const devices = await this.devicesFor(allowed);
      const msg: PushMessage = { title: opts.title, body: opts.body, data };

      for (const { batch, sendAfter } of batches) {
        const outcomes = new Map<string, Outcome>();
        const viaOneSignal = opts.directOnly ? [] : batch.filter((u) => !devices.get(u)?.movedOff);
        if (viaOneSignal.length) {
          // Same key on every retry: OneSignal drops the duplicate.
          const idempotencyKey = randomUUID();
          const { result, attempts } = await withRetry(() =>
            this.oneSignal.send({ externalIds: viaOneSignal, title: opts.title, body: opts.body, data, idempotencyKey, sendAfter }),
          );
          for (const u of viaOneSignal) outcomes.set(u, { result, attempts, provider: 'onesignal' });
        }
        const direct = batch.flatMap((u) => devices.get(u)?.direct ?? []);
        for (const [u, o] of await this.sendDirect(direct, msg, sendAfter)) {
          if (!outcomes.get(u)?.result.id) outcomes.set(u, o);
        }
        await this.logOutcomes(batch, outcomes, devices, opts, claimed, summary);
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

  /** Users with an opted-in native-push install, for the all-users broadcast (C12). */
  async directUserIds(): Promise<string[]> {
    if (!this.pushSender?.isConfigured()) return [];
    const rows = await this.prisma.userPushDevice.findMany({
      where: { token: { not: null }, optedIn: true },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((r) => r.userId);
  }

  /** Each user's native-push installs. Empty until APNs or FCM is configured. */
  private async devicesFor(userIds: string[]): Promise<Map<string, UserDevices>> {
    const byUser = new Map<string, UserDevices>();
    if (!this.pushSender?.isConfigured() || userIds.length === 0) return byUser;
    const rows = await this.prisma.userPushDevice.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, token: true, platform: true, sandbox: true, optedIn: true },
    });
    for (const r of rows) {
      const entry = byUser.get(r.userId) ?? { direct: [], movedOff: true, provider: providerOf(r.platform) };
      if (!r.token) entry.movedOff = false;
      else if (r.optedIn) entry.direct.push({ userId: r.userId, token: r.token, platform: r.platform, sandbox: r.sandbox });
      byUser.set(r.userId, entry);
    }
    return byUser;
  }

  /**
   * Push to native installs. A person counts as reached when any of their
   * devices accepted it. Dead tokens (app uninstalled) are deleted. Inside
   * quiet hours it becomes a delayed job, counted SENT once queued, as
   * OneSignal's send_after was; without Redis it goes now.
   */
  private async sendDirect(devices: DirectDevice[], msg: PushMessage, sendAfter?: Date): Promise<Map<string, Outcome>> {
    const out = new Map<string, Outcome>();
    if (!devices.length || !this.pushSender) return out;
    if (sendAfter && (await this.deferDirect([...new Set(devices.map((d) => d.userId))], msg, sendAfter))) {
      for (const d of devices) out.set(d.userId, { result: { id: 'queued' }, attempts: 0, provider: providerOf(d.platform) });
      return out;
    }
    const sender = this.pushSender;
    // The app icon shows the bell's unread count (C13).
    const badges = await this.unreadCounts([...new Set(devices.map((d) => d.userId))]);
    const dead: string[] = [];
    await inChunks(
      devices,
      async (d) => {
        const badge = badges ? (badges.get(d.userId) ?? 0) : undefined;
        const { result, attempts } = await withRetry(() => sender.send(d, { ...msg, badge }));
        if (result.dead) dead.push(d.token);
        if (!out.get(d.userId)?.result.id) out.set(d.userId, { result, attempts, provider: providerOf(d.platform) });
      },
      DIRECT_CONCURRENCY,
    );
    if (dead.length) {
      await this.prisma.userPushDevice
        .deleteMany({ where: { token: { in: dead } } })
        .catch((err) => this.logger.warn(`Failed to drop ${dead.length} dead push tokens: ${err?.message ?? err}`));
    }
    return out;
  }

  private async deferDirect(userIds: string[], msg: PushMessage, at: Date): Promise<boolean> {
    // A dead Redis makes `queue.add` hang, so only use the queue while the client is up.
    if (!this.deferred || !this.redis?.getClient()) return false;
    try {
      await this.deferred.add(
        'push',
        { userIds, msg },
        { delay: Math.max(0, at.getTime() - Date.now()), removeOnComplete: true, removeOnFail: { age: 86_400 } },
      );
      return true;
    } catch (err: any) {
      this.logger.warn(`Deferred push queue unavailable, sending now: ${err?.message ?? err}`);
      return false;
    }
  }

  /**
   * PushLog + message_deliveries rows for one batch, one write per outcome
   * group. Someone with no outcome had no install that could take it (every
   * install on native push, none with permission on).
   */
  private async logOutcomes(
    batch: string[],
    outcomes: Map<string, Outcome>,
    devices: Map<string, UserDevices>,
    opts: SendOptions,
    claimed: boolean,
    summary: SendSummary,
  ): Promise<void> {
    const groups = new Map<string, { users: string[]; sent: boolean; outcome: Outcome }>();
    for (const userId of batch) {
      const o: Outcome = outcomes.get(userId) ?? {
        result: { id: null, error: 'no_opted_in_device' },
        attempts: 0,
        provider: devices.get(userId)?.provider ?? 'onesignal',
      };
      const sent = !!o.result.id;
      // Native-push ids are per device: keep OneSignal's (one per batch) only.
      const result: AttemptResult = {
        id: sent && o.provider === 'onesignal' ? o.result.id : null,
        error: sent ? undefined : o.result.error,
      };
      const key = [sent, o.provider, result.id, result.error, o.attempts].join('|');
      const group = groups.get(key) ?? { users: [], sent, outcome: { ...o, result } };
      group.users.push(userId);
      groups.set(key, group);
      if (sent) summary.sent++;
      else summary.failed++;
    }
    for (const { users, sent, outcome } of groups.values()) {
      await this.logMany(users, opts.category, sent ? PushLogStatus.SENT : PushLogStatus.FAILED, opts.campaignId, outcome.result.id, outcome.result.error);
      await this.logDeliveries(
        users,
        opts,
        claimed,
        sent ? MessageDeliveryStatus.SENT : MessageDeliveryStatus.FAILED,
        outcome.result,
        outcome.attempts,
        outcome.provider,
      );
    }
  }

  /**
   * The in-app copy, also sent live to each person's open app (C13) before
   * the push goes out. Its own try so a failed insert never costs the push.
   */
  private async writeInbox(userIds: string[], opts: SendOptions): Promise<void> {
    if (!userIds.length) return;
    const inbox = opts.inbox || undefined;
    const type = inbox?.type ?? (typeof opts.data?.type === 'string' ? opts.data.type : opts.category);
    const dataEventId = typeof opts.data?.eventId === 'string' ? opts.data.eventId : null;
    const row = {
      eventId: inbox?.eventId ?? dataEventId,
      type: type.slice(0, 40),
      title: opts.title.slice(0, 200), // VarChar(200); a longer title failed the whole insert
      body: opts.body,
      deepLink: opts.deepLink ?? null,
    };
    try {
      await this.prisma.userNotification.createMany({
        data: userIds.map((userId) => ({
          userId,
          ...row,
          data: (opts.data ?? undefined) as Prisma.InputJsonValue | undefined,
        })),
      });
    } catch (err: any) {
      this.logger.warn(`Failed to write in-app notifications: ${err?.message ?? err}`);
      return;
    }
    this.gateway?.toUsers(userIds, { ...row, data: opts.data ?? null });
  }

  /** Unread in-app notifications per user, for the app icon badge. Null (badge untouched) on failure. */
  private async unreadCounts(userIds: string[]): Promise<Map<string, number> | null> {
    try {
      const rows = await this.prisma.userNotification.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds }, readAt: null },
        _count: { _all: true },
      });
      return new Map(rows.map((r) => [r.userId, r._count._all]));
    } catch (err: any) {
      this.logger.warn(`Unread counts for the badge failed: ${err?.message ?? err}`);
      return null;
    }
  }

  /** How many of `userIds` the check in `send` would let through right now. */
  async countAllowed(userIds: string[], category: NotificationCategory, kind: string = category): Promise<number> {
    const { allowed } = await canSend(this.prisma, userIds, { kind, category, channel: 'push' });
    return allowed.size;
  }

  private deliveryMeta(userId: string, opts: SendOptions, provider: DeliveryProvider = 'onesignal'): DeliveryMeta {
    return {
      channel: MessageChannel.PUSH,
      provider,
      kind: opts.kind ?? opts.category,
      label: opts.title,
      recipient: userId,
      userId,
      dedupKey: opts.dedupKey,
      campaignId: opts.campaignId,
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
    provider: DeliveryProvider = 'onesignal',
  ): Promise<void> {
    if (claimed) {
      await finishDelivery(this.prisma, this.deliveryMeta(userIds[0], opts, provider), true, status, result, attempts);
      return;
    }
    await logDeliveries(
      this.prisma,
      userIds.map((userId) => {
        const { dedupKey: _ignored, ...meta } = this.deliveryMeta(userId, opts, provider);
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
