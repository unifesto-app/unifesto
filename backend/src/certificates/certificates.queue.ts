import {
  Injectable,
  Logger,
  ServiceUnavailableException,
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

/** `issue` jobs carry a batch; `reissue-revoked` jobs an event + requester. */
type IssuanceJobData =
  | { batchId: string }
  | { eventId: string; userId: string };

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
 * WHERE IT RUNS (S20): in production the worker lives only in the separate
 * `cert-worker` container (its own memory limit), and the API replicas set
 * `CERT_WORKER=false` so a render can never OOM a replica serving traffic.
 * Unset = the worker runs in-process too (local dev, single-process setups).
 *
 * REDIS-OPTIONAL: if Redis is not configured at all (local dev), {@link add}
 * returns false and the caller processes the batch inline. When Redis IS
 * configured but unreachable, enqueueing fails fast with a 503 instead of
 * rendering inline on the request path.
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
    // The producer fails fast (no offline queue), so a Redis outage surfaces
    // as a 503 on Issue instead of a request hanging until Redis returns.
    this.queueConnection = this.redis.createClient({
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
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

    if (this.config.get<string>('CERT_WORKER') === 'false') {
      this.workerConnection.disconnect();
      this.workerConnection = null;
      this.logger.log(
        'Certificate issuance queue ready (worker runs in cert-worker)',
      );
      return;
    }

    this.worker = new Worker<IssuanceJobData>(
      QUEUE_NAME,
      async (job: Job<IssuanceJobData>) => {
        // Lazy resolve to sidestep the service<->queue circular dependency.
        const service = this.moduleRef.get(CertificatesService, {
          strict: false,
        });
        const data = job.data;
        if ('batchId' in data) await service.processBatch(data.batchId);
        else await service.reissueAllRevokedNow(data.userId, data.eventId);
      },
      { connection: this.workerConnection, concurrency },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Certificate job ${job?.id} (${job?.name}) failed: ${err.message}`,
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
   * no queue is available (Redis not configured) — the caller then runs it
   * inline. Throws 503 when Redis is configured but unreachable.
   */
  add(batchId: string): Promise<boolean> {
    return this.enqueue('issue', { batchId });
  }

  /** Enqueue "reissue every revoked certificate" for an event (same contract). */
  addReissueRevoked(eventId: string, userId: string): Promise<boolean> {
    return this.enqueue('reissue-revoked', { eventId, userId });
  }

  private async enqueue(name: string, data: IssuanceJobData): Promise<boolean> {
    if (!this.queue) return false;
    try {
      await this.queue.add(name, data, {
        // A crash mid-batch leaves the job for BullMQ to retry; processBatch is
        // idempotent (already-issued recipients are skipped), so a retry resumes.
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 86_400, count: 500 },
        removeOnFail: { age: 604_800 },
      });
    } catch (err) {
      this.logger.error(
        `Could not enqueue certificate job ${name}: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Certificate processing is temporarily unavailable. Please try again in a minute.',
      );
    }
    return true;
  }
}
