import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AdminService } from '../admin/admin.service';

/**
 * Public probe for an EXTERNAL uptime monitor (UptimeRobot, Better Stack…).
 * The in-process sampler can't report an outage of the process itself; a
 * monitor on another host hitting this through Caddy can.
 *
 * 200 when Postgres + Redis answer, 503 otherwise. Body carries no error
 * messages, only per-dependency up/down, since it is unauthenticated.
 * Deliberately not the Docker healthcheck: that must stay liveness-only, or a
 * DB blip would pull every replica out of rotation at once.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  /** Probes arrive every few seconds; each check hits S3, so reuse it briefly. */
  static readonly CACHE_MS = 10_000;
  private cached: {
    at: number;
    value: ReturnType<AdminService['getHealthStatus']>;
  } | null = null;

  constructor(private readonly admin: AdminService) {}

  private health() {
    const now = Date.now();
    if (!this.cached || now - this.cached.at > HealthController.CACHE_MS) {
      const value = this.admin.getHealthStatus();
      // Never pin a rejected check for the whole window.
      value.catch(() => (this.cached = null));
      this.cached = { at: now, value };
    }
    return this.cached.value;
  }

  @Get()
  @HttpCode(200)
  async probe(@Res({ passthrough: true }) res: Response) {
    const h = await this.health();
    const database = h.services.database.status === 'connected';
    const redis = h.services.redis.status === 'connected';
    const storage = h.services.storage.status === 'connected';
    // Storage alone being down degrades uploads, not the API: don't page on it.
    const ok = database && redis;
    if (!ok) res.status(503);
    return { ok, database, redis, storage, at: h.timestamp };
  }
}
