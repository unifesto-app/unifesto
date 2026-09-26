import type { Request, Response, NextFunction } from 'express';
import { LogsService } from './logs.service';

/**
 * Global Express middleware that records every request to the api_logs table
 * on response finish. Unlike a Nest interceptor, this runs for *all* requests —
 * including auth rejections (401/403) and unmatched routes (404) — and by the
 * time `finish` fires, guards have populated `req.user`.
 */
export function createRequestLogger(logs: LogsService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();

    res.on('finish', () => {
      const path = String(req.originalUrl || req.url || '').split('?')[0];

      // Skip the admin log viewer's own polling, external uptime probes + CORS preflights.
      if (
        path.startsWith('/admin/logs') ||
        path === '/health' ||
        req.method === 'OPTIONS'
      ) {
        return;
      }

      const headers = req.headers || {};
      const forwarded = String(headers['x-forwarded-for'] || '');
      const ip =
        (headers['cf-connecting-ip'] as string) ||
        forwarded.split(',')[0].trim() ||
        req.ip ||
        null;

      logs.record({
        method: req.method,
        path,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
        userId: (req as { user?: { id?: string } }).user?.id ?? null,
        ipAddress: ip,
        userAgent: (headers['user-agent'] as string) ?? null,
      });
    });

    next();
  };
}
