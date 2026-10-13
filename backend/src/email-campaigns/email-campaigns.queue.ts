import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Job, Queue, Worker } from 'bullmq';
import type Redis from 'ioredis';
import { RedisService } from '../redis/redis.service';
import { EmailCampaignsService } from './email-campaigns.service';

const QUEUE_NAME = 'email-campaigns';
const ATTEMPTS = 3;

interface CampaignJob {
  campaignId: string;
}

/**
 * Runs campaign sends on a BullMQ worker instead of a detached promise in the
 * request process, so a deploy mid-send no longer strands the row in SENDING:
 * BullMQ re-runs a stalled job, and the send resumes from its checkpoint (the
 * recipients that already have a log row are skipped). Same shape and
 * Redis-optional fallback as CertificateIssuanceQueue: without Redis, `add`
 * returns false and the caller sends inline.
 */
@Injectable()
export class EmailCampaignQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailCampaignQueue.name);
  private queue: Queue<CampaignJob> | null = null;
  private worker: Worker<CampaignJob> | null = null;
  private connections: Redis[] = [];

  constructor(
    private readonly redis: RedisService,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit() {
    const queueConn = this.redis.createClient();
    const workerConn = this.redis.createClient();
    if (!queueConn || !workerConn) {
      this.logger.warn('Redis not configured — email campaigns send inline.');
      queueConn?.disconnect();
      workerConn?.disconnect();
      return;
    }
    this.connections = [queueConn, workerConn];
    this.queue = new Queue<CampaignJob>(QUEUE_NAME, { connection: queueConn });
    // One campaign at a time per replica: sends are already paced per batch.
    this.worker = new Worker<CampaignJob>(
      QUEUE_NAME,
      async (job: Job<CampaignJob>) => {
        const service = this.moduleRef.get(EmailCampaignsService, { strict: false });
        await service.runCampaign(job.data.campaignId, {
          lastAttempt: job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
        });
      },
      { connection: workerConn, concurrency: 1 },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error(`Campaign job ${job?.data.campaignId} failed: ${err.message}`),
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    for (const c of this.connections) c.disconnect();
  }

  /**
   * Queue a send. The job id is the campaign id, so a campaign already queued
   * or running is not queued twice. False when there is no queue.
   */
  async add(campaignId: string): Promise<boolean> {
    if (!this.queue) return false;
    await this.queue.add(
      'send',
      { campaignId },
      {
        jobId: campaignId,
        attempts: ATTEMPTS,
        backoff: { type: 'exponential', delay: 30_000 },
        // Removed either way so the stale sweep can queue it again.
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    return true;
  }
}
