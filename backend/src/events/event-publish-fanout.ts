import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job, Queue, Worker } from 'bullmq';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EmailService } from '../email/email.service';
import { canSend } from '../notifications/send-policy';
import { forEachPage, inChunks } from '../common/batching';
import { reportError } from '../common/observability';
import { NotificationEvents } from '../notifications/notifications.constants';
import type { NotifyBatchEvent } from '../notifications/notifications.events';
import { formatEventDate, formatEventTime } from './event-dates';

const QUEUE_NAME = 'event-publish-fanout';
const ATTEMPTS = 3;

interface FanoutJob {
  eventId: string;
}

/**
 * J5: the "new event in your space" email to every space member, off the
 * request path. Publishing used to fire one Resend call per member from the
 * request (hundreds in the same tick, lost on a deploy).
 *
 * The job carries only the event id; the worker re-reads the members a page
 * at a time and sends with a bounded number in flight. Each email has a dedup
 * key (`event.published:<event>:<user>`), which is the checkpoint: a retried
 * or stalled job (BullMQ re-runs it after a crash) skips everyone already
 * mailed. No DB status row, so no stale sweep is needed: the job itself stays
 * in Redis until it completes or runs out of attempts. Without Redis it runs
 * inline in the background, as before.
 */
@Injectable()
export class EventPublishFanout implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventPublishFanout.name);
  private queue: Queue<FanoutJob> | null = null;
  private worker: Worker<FanoutJob> | null = null;
  private connections: Redis[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly email: EmailService,
    private readonly events?: EventEmitter2,
  ) {}

  onModuleInit() {
    const queueConn = this.redis.createClient();
    const workerConn = this.redis.createClient();
    if (!queueConn || !workerConn) {
      queueConn?.disconnect();
      workerConn?.disconnect();
      return;
    }
    this.connections = [queueConn, workerConn];
    this.queue = new Queue<FanoutJob>(QUEUE_NAME, { connection: queueConn });
    this.worker = new Worker<FanoutJob>(QUEUE_NAME, (job: Job<FanoutJob>) => this.run(job.data.eventId), {
      connection: workerConn,
      concurrency: 1,
    });
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Publish fan-out for ${job?.data.eventId} failed: ${err.message}`);
      if (!job || job.attemptsMade >= (job.opts.attempts ?? 1)) reportError(err, { queue: QUEUE_NAME, eventId: job?.data.eventId });
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    for (const c of this.connections) c.disconnect();
  }

  /** Queue the emails for a just-published event. Never throws. */
  async enqueue(eventId: string): Promise<void> {
    // Same rule as email campaigns: a dead Redis makes `queue.add` hang, so
    // only use the queue while the client is up.
    if (this.queue && this.redis.getClient()) {
      try {
        await this.queue.add(
          'send',
          { eventId },
          {
            // A double publish can't queue twice. No ':' in it: BullMQ refuses
            // custom ids with one, which sent every fan-out inline until 3 Nov.
            jobId: `publish-${eventId}`,
            attempts: ATTEMPTS,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: true,
            removeOnFail: { age: 7 * 86_400 },
          },
        );
        return;
      } catch (err) {
        this.logger.warn(`Publish fan-out queue unavailable, sending inline: ${(err as Error).message}`);
      }
    }
    void this.run(eventId).catch((err) => reportError(err, { job: QUEUE_NAME, eventId }));
  }

  /** Send to every space member not opted out of new-event mail. Safe to re-run. */
  async run(eventId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { space: { select: { name: true } } },
    });
    if (!event?.spaceId) return;
    const base = {
      eventTitle: event.title,
      eventDate: formatEventDate(event.startDateTime),
      eventTime: formatEventTime(event.startDateTime, event.endDateTime),
      venueName: event.venueName || undefined,
      city: event.city || undefined,
      isOnline: event.type === 'ONLINE',
      spaceName: event.space?.name ?? '',
      registrationUrl: `https://unifesto.app/event/${event.slug}`,
    };
    const seen = new Set<string>();
    await forEachPage(
      (page) =>
        this.prisma.userRole.findMany({
          ...page,
          where: { spaceId: event.spaceId },
          select: {
            id: true,
            userId: true,
            user: {
              select: {
                fullName: true,
                username: true,
                identities: { where: { email: { not: null } }, select: { email: true }, take: 1 },
              },
            },
          },
        }),
      async (rows) => {
        const fresh = rows.filter(
          (r) => r.user.identities[0]?.email && !seen.has(r.userId) && seen.add(r.userId),
        );
        const { allowed } = await canSend(this.prisma, fresh.map((r) => r.userId), {
          kind: 'event.published',
          category: 'newEvents',
          channel: 'email',
          addresses: new Map(fresh.map((r) => [r.userId, r.user.identities[0].email!])),
          log: { provider: 'resend', label: event.title },
        });
        await inChunks(
          fresh.filter((r) => allowed.has(r.userId)),
          (r) =>
            this.email.sendEventPublished(
              {
                ...base,
                email: r.user.identities[0].email!,
                userName: r.user.fullName || r.user.username || 'there',
              },
              { dedupKey: `event.published:${eventId}:${r.userId}`, kind: 'event.published', userId: r.userId },
            ),
          10,
        );
      },
    );
    await this.runCityAlerts(event);
  }

  /**
   * "New in <city>" push to people who asked for that city. Only public,
   * top-level, in-person events (no burst for a super event's sub-events), and
   * never to the space's own people (they got the member email) or the creator.
   * Goes out as a NotifyBatch because EventsModule can't inject NotifyService;
   * the per-person dedup key makes a re-run safe.
   */
  private async runCityAlerts(event: {
    id: string;
    spaceId: string;
    title: string;
    slug: string;
    city: string | null;
    venueName: string | null;
    type: string;
    status: string;
    visibility: string;
    parentEventId: string | null;
    createdBy: string;
    startDateTime: Date;
    timezone: string;
    space: { name: string } | null;
  }): Promise<void> {
    const city = event.city?.trim();
    if (
      !city ||
      !this.events ||
      event.visibility !== 'PUBLIC' ||
      event.parentEventId ||
      event.type === 'ONLINE' ||
      !['PUBLISHED', 'ONGOING'].includes(event.status)
    ) {
      return;
    }
    await forEachPage(
      (page) =>
        this.prisma.user.findMany({
          ...page,
          where: {
            newEventsCity: { equals: city, mode: 'insensitive' },
            id: { not: event.createdBy },
            roles: { none: { spaceId: event.spaceId } },
            deletionRequestedAt: null,
          },
          select: { id: true },
        }),
      async (users) => {
        this.events!.emit(NotificationEvents.NotifyBatch, {
          kind: 'city.new_event',
          items: users.map((u) => ({
            userId: u.id,
            dedupKey: `city.new_event:${event.id}:${u.id}`,
            data: {
              eventId: event.id,
              eventSlug: event.slug,
              eventTitle: event.title,
              city,
              whenText: formatEventDate(event.startDateTime, event.timezone),
              venueName: event.venueName || undefined,
              spaceName: event.space?.name ?? '',
            },
          })),
        } satisfies NotifyBatchEvent<'city.new_event'>);
      },
    );
  }
}
