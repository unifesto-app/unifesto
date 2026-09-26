import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { Queue, Worker, Job } from 'bullmq';
import type Redis from 'ioredis';
import { RedisService } from '../redis/redis.service';
import { CertificatesService } from './certificates.service';

const QUEUE_NAME = 'certificate-issuance';

interface IssuanceJobData {
  batchId: string;
}

/**
 * BullMQ-backed queue for certificate issuance.
 *
 * WHY THIS EXISTS: issuance renders a PDF + PNG per recipient with
 * @napi-rs/canvas (Skia). Those buffers live in NATIVE memory, outside the V8
 * heap, so `--max-old-space-size` does not bound them. A big batch run inline in
 * the request ballooned a replica's RSS past its cap and got it OOM-killed. By
 * enqueuing the batch and processing it on a worker with LOW concurrency, the
 * number of simultaneous renders is bounded to (replicas x concurrency) rather
 * than "however many organisers hit Issue at once x batch size".
 *
 * The worker resolves {@link CertificatesService} lazily via {@link ModuleRef}
 * to avoid a construction-time circular dependency (the service enqueues here;
 * the worker calls back into the service).
 *
 * REDIS-OPTIONAL: if Redis is not configured, {@link add} returns false and the
 * caller processes the batch inline — the feature still works, just without the
 * memory bound (matches how the throttler and socket adapter degrade).
 */
@Injectable()
export class CertificateIssuanceQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CertificateIssuanceQueue.name);
  private queue: Queue<IssuanceJobData> | null = null;
  private worker: Worker<IssuanceJobData> | null = null;
  private queueConnection: Redis | null = null;
  private workerConnection: Redis | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit() {
    // Two dedicated connections: BullMQ requires maxRetriesPerRequest:null
    // (which createClient() sets) and recommends separate connections per
    // Queue/Worker rather than sharing the cache client's command pipeline.
    this.queueConnection = this.redis.createClient();
    this.workerConnection = this.redis.createClient();

    if (!this.queueConnection || !this.workerConnection) {
      this.logger.warn(
        'Redis not configured — certificate issuance will run inline (no memory bound). Set REDIS_HOST/REDIS_PORT to enable the queue.',
      );
      this.queueConnection?.disconnect();
      this.workerConnection?.disconnect();
      this.queueConnection = null;
      this.workerConnection = null;
      return;
    }

    this.queue = new Queue<IssuanceJobData>(QUEUE_NAME, {
      connection: this.queueConnection,
    });

    // Concurrency is the memory knob: 1 (default) means one batch at a time PER
    // REPLICA, so at most `replicas` batches render concurrently. Raise only if
    // the memory headroom is there. `CERT_WORKER_CONCURRENCY`.
    const concurrency = Math.max(
      1,
      Number(this.config.get('CERT_WORKER_CONCURRENCY')) || 1,
    );

    this.worker = new Worker<IssuanceJobData>(
      QUEUE_NAME,
      async (job: Job<IssuanceJobData>) => {
        // Lazy resolve to sidestep the service<->queue circular dependency.
        const service = this.moduleRef.get(CertificatesService, {
          strict: false,
        });
        await service.processBatch(job.data.batchId);
      },
      { connection: this.workerConnection, concurrency },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Issuance job ${job?.id} (batch ${job?.data.batchId}) failed: ${err.message}`,
      );
    });

    this.logger.log(
      `Certificate issuance queue ready (concurrency ${concurrency})`,
    );
  }

  async onModuleDestroy() {
    // Close the worker first so an in-flight batch finishes before its Redis
    // connection is torn down.
    await this.worker?.close();
    await this.queue?.close();
    this.queueConnection?.disconnect();
    this.workerConnection?.disconnect();
  }

  /**
   * Enqueue a batch for processing. Returns true when it was queued, false when
   * no queue is available (Redis absent) — the caller then runs it inline.
   */
  async add(batchId: string): Promise<boolean> {
    if (!this.queue) return false;
    await this.queue.add(
      'issue',
      { batchId },
      {
        // A crash mid-batch leaves the job for BullMQ to retry; processBatch is
        // idempotent (already-issued recipients are skipped), so a retry resumes.
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 86_400, count: 500 },
        removeOnFail: { age: 604_800 },
      },
    );
    return true;
  }
}
