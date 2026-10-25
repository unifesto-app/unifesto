import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';
import { reportError } from '../common/observability';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private healthy = false;
  private timers: NodeJS.Timeout[] = [];

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.initializeClient();
  }

  async onModuleDestroy() {
    this.timers.forEach(clearInterval);
    if (this.client) {
      await this.client.quit();
      this.logger.log('Redis client disconnected');
    }
  }

  /**
   * Initialize Redis client with TLS support and exponential backoff retry logic
   */
  private async initializeClient(): Promise<void> {
    const host = this.configService.get<string>('REDIS_HOST');
    const port = this.configService.get<number>('REDIS_PORT');
    const tlsEnabled = this.configService.get<string>('REDIS_TLS') === 'true';

    if (!host || !port) {
      this.logger.error('Redis configuration missing - REDIS_HOST or REDIS_PORT not set');
      return;
    }

    // Never give up: a null here ends the client for good, and OTP login plus
    // every runExclusive cron stayed broken until a manual restart (J12).
    const retryStrategy = (times: number) => {
      if (times % 10 === 1) {
        this.logger.warn(`Redis reconnect attempt ${times}`, { host, port, tls: tlsEnabled });
      }
      return Math.min(times * 200, 5000);
    };

    try {
      this.client = new Redis({
        host,
        port,
        tls: tlsEnabled ? {} : undefined, // Enable TLS if configured
        retryStrategy,
        maxRetriesPerRequest: 3,
        // A hung connection fails the command instead of the request.
        commandTimeout: 2000,
        enableReadyCheck: true,
        lazyConnect: false, // Connect immediately
        // ioredis 6 defaults to RESP3; keep the v5 wire protocol.
        protocol: 2,
      });

      // Connection event handlers
      this.client.on('connect', () => {
        this.logger.log('Redis client connecting...');
      });

      this.client.on('ready', () => {
        this.healthy = true;
        this.logger.log('Redis connection established successfully', {
          host,
          port,
          tls: tlsEnabled,
        });
      });

      this.client.on('error', (error) => {
        this.healthy = false;
        this.logger.error('Redis connection error', {
          host,
          port,
          tls: tlsEnabled,
          error: error.message,
        });
      });

      this.client.on('close', () => {
        this.healthy = false;
        this.logger.warn('Redis connection closed');
      });

      this.client.on('reconnecting', () => {
        this.logger.log('Redis client reconnecting...');
      });

      // Wait for connection to be ready or fail
      await this.client.ping();
      this.healthy = true;
      this.logger.log('Redis ping successful');
    } catch (error) {
      // Keep the client: it keeps reconnecting and 'ready' flips healthy back.
      this.healthy = false;
      this.logger.error('Redis initialization failed - degraded until it reconnects', {
        host,
        port,
        tls: tlsEnabled,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * The shared client while it is connected, else null. Every caller treats
   * null as "Redis unavailable" and degrades, so an outage fails fast instead
   * of queueing, and recovery needs no restart.
   */
  getClient(): Redis | null {
    return this.healthy ? this.client : null;
  }

  /**
   * Build a NEW, dedicated Redis connection — separate from the shared cache
   * client returned by getClient().
   *
   * Use this for consumers that must not share the cache client's command
   * pipeline and must not be caught by its startup race: the throttler store
   * and the Socket.IO pub/sub adapter. Unlike getClient(), this returns a
   * connecting client *immediately* — ioredis buffers commands until the
   * connection is ready — so it is safe to call during module bootstrap,
   * before the main connection's health-check ping has resolved. That is what
   * stops those consumers from latching onto an in-memory fallback when Redis
   * is merely a second slow to connect.
   *
   * Returns null only when Redis is not configured, so callers degrade
   * gracefully to in-memory. Caller owns the returned client's lifecycle.
   * `overrides` tweaks the connection (e.g. the throttler fails fast instead
   * of queueing commands forever).
   */
  createClient(overrides: RedisOptions = {}): Redis | null {
    const host = this.configService.get<string>('REDIS_HOST');
    const port = this.configService.get<number>('REDIS_PORT');
    const tlsEnabled = this.configService.get<string>('REDIS_TLS') === 'true';

    if (!host || !port) {
      this.logger.warn(
        'createClient(): Redis not configured (REDIS_HOST/REDIS_PORT missing)',
      );
      return null;
    }

    return new Redis({
      host,
      port,
      tls: tlsEnabled ? {} : undefined,
      // Long-lived infra connection: keep reconnecting, and never give up on a
      // queued command — required for pub/sub subscribers, and keeps the
      // throttler store usable across brief Redis blips.
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 200, 5000),
      // ioredis 6 defaults to RESP3; BullMQ scripts, the socket.io adapter
      // and the throttler store were built against RESP2 replies.
      protocol: 2,
      ...overrides,
    });
  }

  /**
   * Keep a per-process config cache in step across replicas (J12). Call the
   * returned bump() after an edit (and after reloading locally): every other
   * replica sees the new stamp and reloads within ~2s. Every replica also
   * reloads every 30s regardless, the floor while Redis is down.
   */
  syncCache(name: string, reload: () => Promise<void>): () => Promise<void> {
    const key = `config-stamp:${name}`;
    let seen: string | null = null;
    let ticks = 0;
    let busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const stamp = await this.get(key).catch(() => null);
        const changed = stamp !== null && seen !== null && stamp !== seen;
        if (stamp !== null) seen = stamp;
        if (changed || ++ticks % 15 === 0) await reload();
      } catch (err) {
        this.logger.warn(`syncCache(${name}) reload failed: ${(err as Error).message}`);
      } finally {
        busy = false;
      }
    }, 2000);
    timer.unref();
    this.timers.push(timer);

    return async () => {
      const client = this.getClient();
      if (!client) return;
      const n = await client.incr(key).catch(() => null);
      // Skip our own reload only when nobody else bumped in between.
      if (n !== null && seen !== null && Number(seen) + 1 === n) seen = String(n);
    };
  }

  /**
   * Check if Redis connection is healthy
   * @returns boolean indicating connection status
   */
  isHealthy(): boolean {
    return this.healthy;
  }

  async get(key: string): Promise<string | null> {
    const client = this.getClient();
    if (!client) return null;
    return client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    if (ttlSeconds) {
      await client.setex(key, ttlSeconds, value);
    } else {
      await client.set(key, value);
    }
  }

  /**
   * Atomic set-if-absent with a TTL. Returns true when the key was newly set
   * (the caller "won"), false when it already existed. Used for idempotency
   * guards where a non-atomic get-then-set would race. Returns true when Redis
   * is unavailable so callers fail open rather than block.
   */
  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const client = this.getClient();
    if (!client) return true;
    const res = await client.set(key, value, 'EX', ttlSeconds, 'NX');
    return res === 'OK';
  }

  /**
   * Cross-replica "run this exactly once" guard for scheduled jobs.
   *
   * `@nestjs/schedule` registers every `@Cron` inside *every* process, so with
   * N backend replicas each job fires N times simultaneously. Wrapping the job
   * body here lets a single replica win an atomic Redis lock (SET NX EX) and
   * run `task`; the others no-op. Bucket the `key` by the job's own cadence
   * (e.g. `cron:dailyDigest:2026-09-10`) so the next scheduled run is free to
   * win again.
   *
   * @returns true if THIS caller won the lock and ran `task`; false otherwise.
   *
   * `failOpen` (default true): when Redis is unavailable the replicas cannot
   * coordinate. true → run anyway (a rare duplicate beats a missed per-attendee
   * reminder). false → skip (for bulk broadcasts like the daily/weekly digest,
   * where skipping one run during a Redis outage is harmless but triple-sending
   * is the very bug this guards against).
   */
  async runExclusive(
    key: string,
    ttlSeconds: number,
    task: () => Promise<void>,
    opts: { failOpen?: boolean } = {},
  ): Promise<boolean> {
    const failOpen = opts.failOpen ?? true;

    // Cron failures reach Sentry here (no-op without SENTRY_DSN), then rethrow
    // so the scheduler still logs them.
    const run = () =>
      task().catch((err) => {
        reportError(err, { cron: key });
        throw err;
      });

    const client = this.getClient();
    if (!client) {
      if (failOpen) {
        await run();
        return true;
      }
      this.logger.warn(
        `runExclusive(${key}): Redis unavailable — skipping (fail-closed)`,
      );
      return false;
    }

    const won =
      (await client.set(key, '1', 'EX', ttlSeconds, 'NX')) === 'OK';
    if (!won) return false;

    await run();
    return true;
  }

  async del(key: string): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    await client.del(key);
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}
