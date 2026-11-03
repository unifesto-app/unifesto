import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job, Queue, Worker } from 'bullmq';
import type Redis from 'ioredis';
import { RedisService } from '../redis/redis.service';
import { reportError } from '../common/observability';
import { NotificationEvents } from './notifications.constants';
import type { NotifyBatchEvent } from './notifications.events';
import { TransactionalNotificationHandler } from './handlers/transactional-notification.handler';

const QUEUE_NAME = 'notifications';
export type NotificationKey = keyof typeof NotificationEvents;
/** The handler needs an on<Key> method for every NotificationEvents key: this type fails the build otherwise. */
type Handlers = Record<`on${NotificationKey}`, (e: any) => Promise<void>>;
interface FanoutJob {
  json: string;
}

/** Job data is stored as JSON: tag Dates so they come back as Dates (space.approved keys its dedup on one). */
export const pack = (payload: unknown): string =>
  JSON.stringify(payload, function (this: Record<string, unknown>, k: string, v: unknown) {
    return this[k] instanceof Date ? { $date: v } : v;
  });
export const unpack = (json: string): unknown =>
  JSON.parse(json, (_k, v: { $date?: unknown } | null) =>
    v && typeof v === 'object' && typeof v.$date === 'string' ? new Date(v.$date) : v,
  );

/**
 * S62: notification fan-out as BullMQ jobs, so a deploy or crash no longer
 * drops what was emitted but not yet sent. Emit call sites are unchanged: this
 * listens to every NotificationEvents name and queues it, and the worker runs
 * the handler's matching on<Key> method.
 *
 * A job runs at most once (no retries, and a job a crash left mid-run fails
 * instead of re-running), because send() to many people has no per-person
 * dedup. A NotifyBatch becomes one job per person, so a restart loses at most
 * the person being sent to; those wait behind single events (priority), so a
 * big batch never delays a "you're up" push. Without Redis it runs inline.
 */
@Injectable()
export class NotificationFanoutQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationFanoutQueue.name);
  private queue: Queue<FanoutJob> | null = null;
  private worker: Worker<FanoutJob> | null = null;
  private connections: Redis[] = [];

  constructor(
    private readonly redis: RedisService,
    private readonly events: EventEmitter2,
    private readonly handler: TransactionalNotificationHandler,
  ) {}

  onModuleInit() {
    for (const [key, name] of Object.entries(NotificationEvents) as [NotificationKey, string][]) {
      this.events.on(name, (payload: unknown) => void this.enqueue(key, payload));
    }
    const queueConn = this.redis.createClient();
    const workerConn = this.redis.createClient();
    if (!queueConn || !workerConn) {
      queueConn?.disconnect();
      workerConn?.disconnect();
      return;
    }
    this.connections = [queueConn, workerConn];
    this.queue = new Queue<FanoutJob>(QUEUE_NAME, { connection: queueConn });
    this.worker = new Worker<FanoutJob>(
      QUEUE_NAME,
      (job: Job<FanoutJob>) => this.run(job.name as NotificationKey, unpack(job.data.json)),
      { connection: workerConn, concurrency: 4, maxStalledCount: 0 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Notification ${job?.name} failed: ${err.message}`);
      reportError(err, { queue: QUEUE_NAME, event: job?.name });
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    for (const c of this.connections) c.disconnect();
  }

  /** Queue one emitted event. Never throws: without the queue it runs inline, as before. */
  async enqueue(key: NotificationKey, payload: unknown): Promise<void> {
    // A dead Redis makes `queue.add` hang, so only use the queue while the client is up.
    if (this.queue && this.redis.getClient()) {
      const opts = { removeOnComplete: true, removeOnFail: { age: 86_400 } };
      try {
        if (key === 'NotifyBatch') {
          const { kind, items } = payload as NotifyBatchEvent;
          await this.queue.addBulk(
            items.map((i) => ({ name: key, data: { json: pack({ kind, items: [i] }) }, opts: { ...opts, priority: 1 } })),
          );
        } else {
          await this.queue.add(key, { json: pack(payload) }, opts);
        }
        return;
      } catch (err) {
        this.logger.warn(`Notification queue unavailable, sending inline: ${(err as Error).message}`);
      }
    }
    void this.run(key, payload).catch((err) => reportError(err, { event: key }));
  }

  /** The handler method named for the event: NotifyBatch → onNotifyBatch. */
  private run(key: NotificationKey, payload: unknown): Promise<void> {
    const handlers: Handlers = this.handler;
    return handlers[`on${key}`](payload);
  }
}
