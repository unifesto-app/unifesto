import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Job, Queue, Worker } from 'bullmq';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { reportError } from '../common/observability';

const QUEUE_NAME = 'whatsapp-broadcast';
/** An unfinished broadcast this old has lost its run (crash, deploy, dead job). */
const STALE_AFTER_MS = 15 * 60_000;
/** Older than this it is left alone: a day-late promo is worse than none. */
const GIVE_UP_AFTER_MS = 24 * 60 * 60_000;

/**
 * J5: platform WhatsApp broadcasts as BullMQ jobs (one per WhatsappBroadcast
 * row) instead of a detached loop that a deploy silently killed. Each send is
 * keyed `broadcast:<id>:<user>` in the delivery log, so a re-run (retry,
 * stalled job, the sweep below) skips everyone already messaged.
 */
@Injectable()
export class WhatsappBroadcastQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappBroadcastQueue.name);
  private queue: Queue<{ broadcastId: string }> | null = null;
  private worker: Worker<{ broadcastId: string }> | null = null;
  private connections: Redis[] = [];
  /** Set by WhatsAppService (no import back, so no cycle). */
  private handler: ((broadcastId: string) => Promise<unknown>) | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  setHandler(fn: (broadcastId: string) => Promise<unknown>) {
    this.handler = fn;
  }

  onModuleInit() {
    const queueConn = this.redis.createClient();
    const workerConn = this.redis.createClient();
    if (!queueConn || !workerConn) {
      queueConn?.disconnect();
      workerConn?.disconnect();
      return;
    }
    this.connections = [queueConn, workerConn];
    this.queue = new Queue(QUEUE_NAME, { connection: queueConn });
    // Concurrency 1 per replica: Meta's per-second cap is per number.
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<{ broadcastId: string }>) => {
        if (!this.handler) throw new Error('broadcast handler not registered');
        await this.handler(job.data.broadcastId);
      },
      { connection: workerConn, concurrency: 1 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`WhatsApp broadcast ${job?.data.broadcastId} failed: ${err.message}`);
      if (!job || job.attemptsMade >= (job.opts.attempts ?? 1)) {
        reportError(err, { queue: QUEUE_NAME, broadcastId: job?.data.broadcastId });
      }
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    for (const c of this.connections) c.disconnect();
  }

  /** False when there is no queue or Redis is down: the caller runs it inline. */
  async add(broadcastId: string): Promise<boolean> {
    if (!this.queue || !this.redis.getClient()) return false;
    try {
      await this.queue.add(
        'send',
        { broadcastId },
        {
          jobId: `broadcast:${broadcastId}`, // re-adding a queued/running one is a no-op
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
          removeOnComplete: true,
          removeOnFail: true, // so the sweep can try again later
        },
      );
      return true;
    } catch (err) {
      this.logger.warn(`Broadcast queue unavailable: ${(err as Error).message}`);
      return false;
    }
  }

  /** Re-queue broadcasts that never finished. Safe: sends are deduped per person. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweepStale(): Promise<void> {
    if (!this.queue) return;
    await this.redis.runExclusive('cron:whatsappBroadcastSweep', 5 * 60, async () => {
      const now = Date.now();
      const stale = await this.prisma.whatsappBroadcast.findMany({
        where: {
          finishedAt: null,
          createdAt: { lt: new Date(now - STALE_AFTER_MS), gt: new Date(now - GIVE_UP_AFTER_MS) },
        },
        select: { id: true },
      });
      for (const { id } of stale) await this.add(id);
    });
  }
}
