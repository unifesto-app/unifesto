import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { withTimeout } from '../http/outbound-timeouts';

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/**
 * Wraps the Redis throttler store so a Redis outage lets requests through
 * instead of hanging them. Without this, a dead Redis stalled every request
 * (health probe included), Caddy ejected every replica at once, and the API
 * went dark even though Postgres was fine.
 *
 * Any store error, or no answer within `timeoutMs`, counts as "not throttled".
 */
export class FailOpenThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger('ThrottlerStorage');
  private lastWarnAt = 0;

  constructor(
    private readonly inner: ThrottlerStorage,
    private readonly timeoutMs = 500,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      return await withTimeout(
        this.inner.increment(key, ttl, limit, blockDuration, throttlerName),
        this.timeoutMs,
        'throttler store',
      );
    } catch (err) {
      // One warning a minute, not one per request.
      if (Date.now() - this.lastWarnAt > 60_000) {
        this.lastWarnAt = Date.now();
        this.logger.warn(
          `Throttler store unavailable, failing open: ${(err as Error).message}`,
        );
      }
      return {
        totalHits: 0,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
