import type { RedisService } from '../redis/redis.service';
import { reportError } from './observability';

/** Failed tries of one automatic refund before it reaches Sentry. */
export const REFUND_ALERT_AFTER = 3;

/**
 * Count a failed automatic refund (keyed by its idempotency key) and report it
 * to Sentry from the {@link REFUND_ALERT_AFTER}th try on: one blip is retried
 * quietly, money stuck for hours is not. Without Redis every failure reports.
 */
export async function noteRefundFailure(
  redis: RedisService | undefined,
  key: string,
  err: unknown,
): Promise<void> {
  // Alerting never breaks the refund path: any counter trouble just reports.
  let n: number | null = null;
  try {
    const client = redis?.getClient();
    const counter = `refund:fail:${key}`;
    n = client ? await client.incr(counter) : null;
    if (client && n === 1) await client.expire(counter, 7 * 24 * 60 * 60);
  } catch {
    // fall through with whatever count we got
  }
  if (n === null || n >= REFUND_ALERT_AFTER) {
    reportError(err, { refund: key, attempts: n === null ? undefined : String(n) });
  }
}

/** Run a refund-retry cron on one replica per tick (lock expires before the next 15-min run). */
export async function runRefundRetry(
  redis: RedisService | undefined,
  name: string,
  task: () => Promise<void>,
): Promise<void> {
  if (redis) await redis.runExclusive(`cron:refundRetry:${name}`, 14 * 60, task);
  else await task();
}
