import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EmailService } from '../email/email.service';
import { emailOptedOutUserIds } from '../email/email-preferences';
import { forEachPage, inChunks } from '../common/batching';
import { reportError } from '../common/observability';
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
            jobId: `publish:${eventId}`, // a double publish can't queue twice
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
        const fresh = rows.filter((r) => !seen.has(r.userId) && seen.add(r.userId));
        const optedOut = await emailOptedOutUserIds(this.prisma, fresh.map((r) => r.userId), 'newEvents');
        await inChunks(
          fresh.filter((r) => r.user.identities[0]?.email && !optedOut.has(r.userId)),
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
  }
}
