import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * How long each append-only table keeps rows, in days. Override one with
 * RETENTION_DAYS_<TABLE> (e.g. RETENTION_DAYS_PUSH_LOGS=30).
 *
 * page_views/short_link_clicks outlive the longest traffic window (365d).
 * email_campaign_logs feed the per-campaign A/B tallies; the campaign row
 * keeps its own open/click counters after its logs go.
 */
export const RETENTION: ReadonlyArray<{
  table: string;
  column: string;
  days: number;
}> = [
  // CERT-In Directions (Apr 2022) require at least 180 days of request logs.
  { table: 'api_logs', column: 'created_at', days: 180 },
  { table: 'page_views', column: 'created_at', days: 400 },
  { table: 'short_link_clicks', column: 'created_at', days: 400 },
  { table: 'push_logs', column: 'created_at', days: 90 },
  { table: 'user_notifications', column: 'created_at', days: 180 },
  { table: 'email_campaign_logs', column: 'sent_at', days: 365 },
  { table: 'whatsapp_messages', column: 'created_at', days: 365 },
];

/** Rows per DELETE, so no single statement holds locks for long. */
const CHUNK = 5000;

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Daily at 04:15 IST, one replica. */
  @Cron('15 4 * * *', { timeZone: 'Asia/Kolkata' })
  async prune(): Promise<void> {
    await this.redis.runExclusive('cron:retention', 60 * 60, async () => {
      await this.pruneAll();
    });
  }

  async pruneAll(now = new Date()): Promise<Record<string, number>> {
    const pruned: Record<string, number> = {};
    for (const { table, column, days } of RETENTION) {
      const override = Number(process.env[`RETENTION_DAYS_${table.toUpperCase()}`]);
      const keep = override > 0 ? override : days;
      const cutoff = new Date(now.getTime() - keep * 24 * 60 * 60 * 1000);
      let total = 0;
      for (;;) {
        // Table/column names come from the constant above, never from input.
        const n = await this.prisma.$executeRawUnsafe(
          `DELETE FROM "${table}" WHERE ctid IN (SELECT ctid FROM "${table}" WHERE "${column}" < $1 LIMIT ${CHUNK})`,
          cutoff,
        );
        total += n;
        if (n < CHUNK) break;
      }
      pruned[table] = total;
      if (total > 0) this.logger.log(`Pruned ${total} ${table} rows older than ${keep}d`);
    }
    return pruned;
  }
}
