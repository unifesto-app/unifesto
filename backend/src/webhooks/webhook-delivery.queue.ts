import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import type Redis from 'ioredis';
import { RedisService } from '../redis/redis.service';
import { reportError } from '../common/observability';

const QUEUE_NAME = 'webhook-deliveries';
/** About two hours of retries: 1, 2, 4 … 64 minutes. */
export const ATTEMPTS = 8;

type Handler = (deliveryId: string, finalAttempt: boolean) => Promise<unknown>;

/**
 * K23: webhook deliveries as BullMQ jobs, retried with backoff. Same shape as
 * the WhatsApp invite blast queue (registrations/group-invite-blast.queue.ts).
 */
@Injectable()
export class WebhookDeliveryQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDeliveryQueue.name);
  private queue: Queue<{ deliveryId: string }> | null = null;
  private worker: Worker<{ deliveryId: string }> | null = null;
  private connections: Redis[] = [];
  /** Set by WebhooksService (no import back, so no cycle). */
  private handler: Handler | null = null;

  constructor(private readonly redis: RedisService) {}

  setHandler(fn: Handler) {
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
      async (job: Job<{ deliveryId: string }>) => {
        if (!this.handler) throw new Error('webhook delivery handler not registered');
        await this.handler(job.data.deliveryId, job.attemptsMade + 1 >= (job.opts.attempts ?? 1));
      },
      { connection: workerConn, concurrency: 4 },
    );
    this.worker.on('failed', (job, err) => {
      // A receiver being down is the receiver's problem: log, don't page.
      this.logger.warn(`Webhook delivery ${job?.data.deliveryId} attempt ${job?.attemptsMade} failed: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    for (const c of this.connections) c.disconnect();
  }

  /**
   * Queue a delivery. `again` gives a resend its own job id (the first job's
   * id stays taken while BullMQ keeps it). Without a queue it goes once,
   * inline and in the background.
   */
  async add(deliveryId: string, again = false): Promise<void> {
    if (this.queue && this.redis.getClient()) {
      try {
        await this.queue.add(
          'deliver',
          { deliveryId },
          {
            // No ':' in custom ids: BullMQ refuses them.
            jobId: again ? `wh-${deliveryId}-${Date.now()}` : `wh-${deliveryId}`,
            attempts: ATTEMPTS,
            backoff: { type: 'exponential', delay: 60_000 },
            removeOnComplete: 1000,
            removeOnFail: 1000,
          },
        );
        return;
      } catch (err) {
        reportError(err, { queue: QUEUE_NAME });
      }
    }
    void this.handler?.(deliveryId, true).catch((err: Error) => this.logger.warn(`Inline webhook delivery failed: ${err.message}`));
  }
}
