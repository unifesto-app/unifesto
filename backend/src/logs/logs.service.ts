import { Injectable, Logger } from '@nestjs/common';
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
}

interface QueryParams {
  method?: string;
  status?: 'success' | 'client_error' | 'server_error' | 'error';
  search?: string;
  userId?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class LogsService {
  private readonly logger = new Logger(LogsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Fire-and-forget write from the interceptor — never blocks the request. */
  record(entry: ApiLogEntry): void {
    this.prisma.apiLog
      .create({
        data: {
          method: entry.method.slice(0, 10),
          path: (entry.path || '').slice(0, 2048),
          statusCode: entry.statusCode,
          durationMs: entry.durationMs,
          userId: entry.userId ?? null,
          ipAddress: entry.ipAddress?.slice(0, 64) ?? null,
          userAgent: entry.userAgent?.slice(0, 1024) ?? null,
          errorMessage: entry.errorMessage?.slice(0, 2048) ?? null,
        },
      })
      .catch((err) =>
        this.logger.debug(`Failed to persist api log: ${err?.message}`),
      );
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
      where.OR = [
        { path: { contains: search, mode: 'insensitive' } },
        { ipAddress: { contains: search } },
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
    const [total, last24h, errors24h, agg] = await Promise.all([
      this.prisma.apiLog.count(),
      this.prisma.apiLog.count({ where: { createdAt: { gte: since } } }),
      this.prisma.apiLog.count({
        where: { createdAt: { gte: since }, statusCode: { gte: 400 } },
      }),
      this.prisma.apiLog.aggregate({
        where: { createdAt: { gte: since } },
        _avg: { durationMs: true },
      }),
    ]);

    return {
      total,
      last24h,
      errors24h,
      avgDurationMs: Math.round(agg._avg.durationMs ?? 0),
    };
  }
}
