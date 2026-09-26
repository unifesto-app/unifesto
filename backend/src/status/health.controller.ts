import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
@ApiTags('Status')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  @HttpCode(200)
  @ApiOperation({ summary: 'Public readiness probe for external monitors' })
  async probe(@Res({ passthrough: true }) res: Response) {
    const h = await this.admin.getHealthStatus();
    const database = h.services.database.status === 'connected';
    const redis = h.services.redis.status === 'connected';
    const storage = h.services.storage.status === 'connected';
    // Storage alone being down degrades uploads, not the API: don't page on it.
    const ok = database && redis;
    if (!ok) res.status(503);
    return { ok, database, redis, storage, at: h.timestamp };
  }
}
