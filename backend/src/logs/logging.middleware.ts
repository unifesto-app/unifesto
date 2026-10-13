import type { Request, Response, NextFunction } from 'express';
import { LogsService } from './logs.service';

/** Path segments this long are ids/tokens (claim links carry bearer tokens). */
const LONG_SEGMENT = /^[^/]{24,}$/;

/**
 * What to store as the path: the matched route template (`/events/:id`), so
 * tokens in the URL never reach the table. Unmatched routes (404s) keep their
 * raw path with any long segment redacted.
 */
export function loggedPath(req: Request): string {
  const route = (req as { route?: { path?: unknown } }).route;
  if (route && typeof route.path === 'string') {
    return `${req.baseUrl || ''}${route.path}` || '/';
  }
  const raw = String(req.originalUrl || req.url || '').split('?')[0];
  return raw
    .split('/')
    .map((s) => (LONG_SEGMENT.test(s) ? ':redacted' : s))
    .join('/');
}

/**
 * Successful GETs are the bulk of traffic and the least interesting: keep one
 * in `sampleRate`, stored with `weight = sampleRate` so counts stay unbiased.
 * Everything else (writes, errors) is always kept.
 */
export function sampleWeight(
  method: string,
  statusCode: number,
  sampleRate: number,
  rand: () => number = Math.random,
): number | null {
  if (sampleRate <= 1 || method !== 'GET' || statusCode >= 400) return 1;
  return rand() < 1 / sampleRate ? sampleRate : null;
}

/**
 * Global Express middleware that records requests to the api_logs table
 * on response finish. Unlike a Nest interceptor, this runs for *all* requests —
 * including auth rejections (401/403) and unmatched routes (404) — and by the
 * time `finish` fires, guards have populated `req.user`.
 */
export function createRequestLogger(logs: LogsService, sampleRate = 1) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();

    res.on('finish', () => {
      const rawPath = String(req.originalUrl || req.url || '').split('?')[0];

      // Skip the admin log viewer's own polling, external uptime probes + CORS preflights.
      if (
        rawPath.startsWith('/admin/logs') ||
        rawPath === '/health' ||
        req.method === 'OPTIONS'
      ) {
        return;
      }

      const weight = sampleWeight(req.method, res.statusCode, sampleRate);
      if (weight === null) return;

      logs.record({
        method: req.method,
        path: loggedPath(req),
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
        userId: (req as { user?: { id?: string } }).user?.id ?? null,
        // `trust proxy` resolves the real client from the proxy chain; raw
        // X-Forwarded-For / CF headers are client-spoofable.
        ipAddress: req.ip ?? null,
        userAgent: (req.headers?.['user-agent'] as string) ?? null,
        weight,
      });
    });

    next();
  };
}
