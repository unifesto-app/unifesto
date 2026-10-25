import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import type Redis from 'ioredis';
import { RedisService } from '../redis/redis.service';
import { reportError } from '../common/observability';

const QUEUE_NAME = 'whatsapp-group-invite-blast';
const ATTEMPTS = 3;

/**
 * J5: the curator's WhatsApp group-invite blast as a BullMQ job. It used to run
 * inside the request (one Meta call after another), so a big event timed out
 * and the curator's retry overlapped the first run. The job re-plans from the
 * DB and claims each recipient before sending (runGroupInviteBlast), so a
 * retried or stalled job only reaches people not yet invited.
 */
@Injectable()
export class GroupInviteBlastQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GroupInviteBlastQueue.name);
  private queue: Queue<{ eventId: string }> | null = null;
  private worker: Worker<{ eventId: string }> | null = null;
  private connections: Redis[] = [];
  /** Set by RegistrationAttendeesService (no import back, so no cycle). */
  private handler: ((eventId: string) => Promise<unknown>) | null = null;

  constructor(private readonly redis: RedisService) {}

  setHandler(fn: (eventId: string) => Promise<unknown>) {
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
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<{ eventId: string }>) => {
        if (!this.handler) throw new Error('invite blast handler not registered');
        await this.handler(job.data.eventId);
      },
      { connection: workerConn, concurrency: 1 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`WhatsApp invite blast for ${job?.data.eventId} failed: ${err.message}`);
      if (!job || job.attemptsMade >= (job.opts.attempts ?? 1)) {
        reportError(err, { queue: QUEUE_NAME, eventId: job?.data.eventId });
      }
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    for (const c of this.connections) c.disconnect();
  }

  /** False when there is no queue or Redis is down: the caller runs it inline. */
  async add(eventId: string): Promise<boolean> {
    if (!this.queue || !this.redis.getClient()) return false;
    try {
      await this.queue.add(
        'send',
        { eventId },
        {
          jobId: `wa-invite:${eventId}`, // a second click while it runs is a no-op
          attempts: ATTEMPTS,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: true, // frees the id for the next blast
          removeOnFail: true,
        },
      );
      return true;
    } catch (err) {
      this.logger.warn(`Invite blast queue unavailable, sending inline: ${(err as Error).message}`);
      return false;
    }
  }
}
