import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ApiLogEntry {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  errorMessage?: string | null;
  /** How many requests this row stands for (sampled 2xx GETs). */
  weight?: number;
}

interface QueryParams {
  method?: string;
  status?: 'success' | 'client_error' | 'server_error' | 'error';
  search?: string;
  userId?: string;
  page?: number;
  limit?: number;
}

/** How long request logs are kept. CERT-In Directions (Apr 2022) require 180 days. */
const RETENTION_DAYS = 180;
/** Buffered writes: flush every FLUSH_MS or once FLUSH_AT rows are queued. */
const FLUSH_MS = 2000;
const FLUSH_AT = 200;
/** Drop (not grow) if the DB is down long enough to back up this far. */
const MAX_BUFFER = 5000;
/** Retention deletes in chunks so one huge DELETE never locks the table. */
const CLEANUP_BATCH = 10000;

@Injectable()
export class LogsService implements OnModuleDestroy {
  private readonly logger = new Logger(LogsService.name);
  private buffer: Prisma.ApiLogCreateManyInput[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Fire-and-forget: queue the row; a batched createMany writes it (S27). */
  record(entry: ApiLogEntry): void {
    if (this.buffer.length >= MAX_BUFFER) return;
    this.buffer.push({
      method: entry.method.slice(0, 10),
      path: (entry.path || '').slice(0, 2048),
      statusCode: entry.statusCode,
      durationMs: entry.durationMs,
      userId: entry.userId ?? null,
      ipAddress: entry.ipAddress?.slice(0, 64) ?? null,
      userAgent: entry.userAgent?.slice(0, 1024) ?? null,
      errorMessage: entry.errorMessage?.slice(0, 2048) ?? null,
      weight: entry.weight ?? 1,
    });
    if (this.buffer.length >= FLUSH_AT) void this.flush();
    else if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(), FLUSH_MS);
      this.timer.unref?.();
    }
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.buffer.length) return;
    const rows = this.buffer;
    this.buffer = [];
    await this.prisma.apiLog
      .createMany({ data: rows })
      .catch((err) =>
        this.logger.debug(`Failed to persist ${rows.length} api logs: ${err?.message}`),
      );
  }

  onModuleDestroy() {
    return this.flush();
  }

  private statusWhere(
    status?: QueryParams['status'],
  ): Prisma.ApiLogWhereInput {
    switch (status) {
      case 'success':
        return { statusCode: { gte: 200, lt: 400 } };
      case 'client_error':
        return { statusCode: { gte: 400, lt: 500 } };
      case 'server_error':
        return { statusCode: { gte: 500 } };
      case 'error':
        return { statusCode: { gte: 400 } };
      default:
        return {};
    }
  }

  async query(params: QueryParams) {
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const skip = (page - 1) * limit;

    const where: Prisma.ApiLogWhereInput = {
      ...this.statusWhere(params.status),
    };
    if (params.method) where.method = params.method.toUpperCase();
    if (params.userId) where.userId = params.userId;
    if (params.search) {
      const search = params.search.trim();
      // Paths are route templates now: a prefix match covers the viewer's
      // needs and, unlike ILIKE '%x%', can stop at the LIMIT (S27).
      where.OR = [
        { path: { startsWith: search } },
        { ipAddress: search },
        ...(/^\d+$/.test(search)
          ? [{ statusCode: Number(search) }]
          : []),
      ];
    }

    const [logs, total] = await Promise.all([
      this.prisma.apiLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.apiLog.count({ where }),
    ]);

    return {
      logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getStats() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // Sum weights, not rows: sampled 2xx GETs stand for `weight` requests.
    const [total, last24h, errors24h, agg] = await Promise.all([
      this.prisma.apiLog.aggregate({ _sum: { weight: true } }),
      this.prisma.apiLog.aggregate({
        where: { createdAt: { gte: since } },
        _sum: { weight: true },
      }),
      this.prisma.apiLog.count({
        where: { createdAt: { gte: since }, statusCode: { gte: 400 } },
      }),
      this.prisma.apiLog.aggregate({
        where: { createdAt: { gte: since } },
        _avg: { durationMs: true },
      }),
    ]);

    return {
      total: total._sum.weight ?? 0,
      last24h: last24h._sum.weight ?? 0,
      errors24h,
      avgDurationMs: Math.round(agg._avg.durationMs ?? 0),
    };
  }

  /** Daily cleanup so the table doesn't grow unbounded. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    let total = 0;
    for (;;) {
      const count = await this.prisma.$executeRaw`
        DELETE FROM api_logs WHERE id IN (
          SELECT id FROM api_logs WHERE created_at < ${cutoff}
          LIMIT ${CLEANUP_BATCH}
        )`;
      total += count;
      if (count < CLEANUP_BATCH) break;
    }
    if (total > 0) this.logger.log(`Pruned ${total} old api logs`);
  }
}
