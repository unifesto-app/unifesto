import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';

/**
 * Optional observability, all OFF unless its env var is set:
 *   SENTRY_DSN       report 5xx responses and cron failures to Sentry
 *   LOG_FORMAT=json  structured pino logs (nestjs-pino) instead of Nest's text logger
 *
 * Sentry is required lazily so an unset DSN costs nothing at boot.
 */

type SentryModule = typeof import('@sentry/node');
let sentry: SentryModule | null = null;

/** Call once, before the app is created (see instrument.ts). */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || sentry) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sentry = require('@sentry/node') as SentryModule;
  sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE,
    // Errors only: no performance tracing.
    tracesSampleRate: 0,
  });
}

/** Send an error to Sentry with a few searchable tags. No-op without a DSN. */
export function reportError(
  error: unknown,
  tags: Record<string, string | undefined> = {},
): void {
  if (!sentry) return;
  const s = sentry;
  s.withScope((scope) => {
    for (const [k, v] of Object.entries(tags)) if (v) scope.setTag(k, v);
    s.captureException(error);
  });
}

export const jsonLogsEnabled = (): boolean => process.env.LOG_FORMAT === 'json';

/**
 * Request id: Cloudflare's `cf-ray` when the request came through the CDN (so a
 * log line can be matched to the CF dashboard), else a caller-supplied
 * `x-request-id`, else a fresh uuid.
 */
export function requestIdFor(req: IncomingMessage): string {
  const h = req.headers;
  const pick = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v)?.slice(0, 128);
  return pick(h['cf-ray']) || pick(h['x-request-id']) || randomUUID();
}
