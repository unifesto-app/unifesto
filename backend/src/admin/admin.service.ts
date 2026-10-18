import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { EmailService } from '../email/email.service';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { SpaceStatus, PaymentStatus, Prisma } from '@prisma/client';
import { deletedWhere, type DeletedFilter } from '../common/soft-delete';
import { COUNTS_AS_ATTENDING } from '../common/attendance';
import { AWS_HTTP_TIMEOUTS } from '../common/http/outbound-timeouts';

export interface ServiceStatus {
  status: 'connected' | 'disconnected';
  latency: number;
  message: string;
}

export interface AppStatus {
  status: 'online';
  uptime: number;
  memoryMB: number;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'down';
  timestamp: string;
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    storage: ServiceStatus;
    app: AppStatus;
  };
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly startTime: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {
    this.startTime = Date.now();
    const region = this.configService.get<string>('AWS_REGION');
    this.bucketName = this.configService.get<string>('S3_BUCKET_NAME') || '';
    
    this.s3Client = new S3Client({
      region: region,
      ...AWS_HTTP_TIMEOUTS,
    });
  }

  /**
   * Check health of all infrastructure services
   */
  async getHealthStatus(): Promise<HealthResponse> {
    const timestamp = new Date().toISOString();

    // Run all health checks in parallel
    const [database, redis, storage, app] = await Promise.all([
      this.checkDatabaseHealth(),
      this.checkRedisHealth(),
      this.checkStorageHealth(),
      this.checkAppHealth(),
    ]);

    // Determine overall status
    const connectedServices = [
      database.status === 'connected',
      redis.status === 'connected',
      storage.status === 'connected',
    ];

    const allConnected = connectedServices.every((s) => s === true);
    const allDisconnected = connectedServices.every((s) => s === false);

    let overallStatus: 'healthy' | 'degraded' | 'down';
    if (allConnected) {
      overallStatus = 'healthy';
    } else if (allDisconnected) {
      overallStatus = 'down';
    } else {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp,
      services: {
        database,
        redis,
        storage,
        app,
      },
    };
  }

  /**
   * Check PostgreSQL database health via Prisma
   */
  private async checkDatabaseHealth(): Promise<ServiceStatus> {
    const startTime = Date.now();

    try {
      // Run a simple SELECT 1 query
      await this.prisma.$queryRaw`SELECT 1`;
      const latency = Date.now() - startTime;

      this.logger.debug(`Database health check passed (${latency}ms)`);

      return {
        status: 'connected',
        latency,
        message: 'Database connection successful',
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      const message =
        error instanceof Error ? error.message : 'Unknown database error';

      this.logger.error('Database health check failed', {
        error: message,
        latency,
      });

      return {
        status: 'disconnected',
        latency,
        message: `Database error: ${message}`,
      };
    }
  }

  /**
   * Check Redis health via ioredis
   */
  private async checkRedisHealth(): Promise<ServiceStatus> {
    const startTime = Date.now();

    try {
      const client = this.redis.getClient();

      if (!client) {
        return {
          status: 'disconnected',
          latency: 0,
          message: 'Redis client not initialized',
        };
      }

      // Run a PING command
      await client.ping();
      const latency = Date.now() - startTime;

      this.logger.debug(`Redis health check passed (${latency}ms)`);

      return {
        status: 'connected',
        latency,
        message: 'Redis connection successful',
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      const message =
        error instanceof Error ? error.message : 'Unknown Redis error';

      this.logger.error('Redis health check failed', {
        error: message,
        latency,
      });

      return {
        status: 'disconnected',
        latency,
        message: `Redis error: ${message}`,
      };
    }
  }

  /**
   * Check S3 storage health via AWS SDK
   */
  private async checkStorageHealth(): Promise<ServiceStatus> {
    const startTime = Date.now();

    try {
      // List objects with maxKeys=1 to minimize data transfer
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        MaxKeys: 1,
      });

      await this.s3Client.send(command);
      const latency = Date.now() - startTime;

      this.logger.debug(`Storage health check passed (${latency}ms)`);

      return {
        status: 'connected',
        latency,
        message: 'S3 storage connection successful',
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      const message =
        error instanceof Error ? error.message : 'Unknown S3 error';

      this.logger.error('Storage health check failed', {
        error: message,
        latency,
      });

      return {
        status: 'disconnected',
        latency,
        message: `S3 error: ${message}`,
      };
    }
  }

  /**
   * Check application health
   */
  private async checkAppHealth(): Promise<AppStatus> {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000); // seconds
    const memoryUsage = process.memoryUsage();
    const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

    return {
      status: 'online',
      uptime,
      memoryMB,
    };
  }

  /**
   * Send expiring subscription reminder emails
   * Should be called by a scheduled job 7 days before expiry
   */
  async sendExpiringSubscriptionEmails(): Promise<void> {
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const sixDaysFromNow = new Date();
    sixDaysFromNow.setDate(sixDaysFromNow.getDate() + 6);

    const expiring = await this.prisma.orgSubscription.findMany({
      where: {
        expiresAt: { gte: sixDaysFromNow, lte: sevenDaysFromNow },
        isActive: true,
        plan: { not: 'STARTER' },
      },
      include: {
        // Billing emails for a space go to its accountable admin (its creator).
        space: {
          select: {
            creator: {
              select: {
                fullName: true,
                username: true,
                identities: { where: { email: { not: null } }, select: { email: true }, take: 1 },
              },
            },
          },
        },
      },
    });

    for (const sub of expiring) {
      const person = sub.space?.creator ?? null;
      const email = person?.identities[0]?.email;
      if (email && sub.expiresAt) {
        await this.emailService
          .sendSubscriptionExpiring({
            email,
            userName: person?.fullName || person?.username || 'there',
            plan: sub.plan,
            expiresAt: this.formatDate(sub.expiresAt),
            renewUrl: 'https://space.unifesto.app/dashboard/billing',
          })
          .catch((err) =>
            this.logger.error('Failed to send expiring subscription email', err),
          );
      }
    }

    this.logger.log(`Sent expiring subscription emails to ${expiring.length} users`);
  }

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }

  /**
   * Platform-wide analytics overview.
   */
  async getAnalyticsOverview() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsers30d,
      totalSpaces,
      activeSpaces,
      pendingSpaceRequests,
      totalEvents,
      publishedEvents,
      totalRegistrations,
      revenueAgg,
      pushSent30d,
      pushFailed30d,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.space.count(),
      this.prisma.space.count({ where: { status: 'ACTIVE' } }),
      this.prisma.spaceRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.event.count(),
      this.prisma.event.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.eventRegistration.count(),
      this.prisma.eventRegistration.aggregate({
        _sum: { totalAmount: true },
        where: { paymentStatus: 'PAID' },
      }),
      // Push delivery over the last 30d (SENT vs FAILED; skips aren't failures).
      this.prisma.pushLog.count({
        where: { status: 'SENT', createdAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.pushLog.count({
        where: { status: 'FAILED', createdAt: { gte: thirtyDaysAgo } },
      }),
    ]);

    const pushAttempted = pushSent30d + pushFailed30d;
    const pushDeliveryRate =
      pushAttempted > 0 ? Math.round((pushSent30d / pushAttempted) * 100) : null;

    return {
      users: { total: totalUsers, newLast30Days: newUsers30d },
      spaces: {
        total: totalSpaces,
        active: activeSpaces,
        pendingRequests: pendingSpaceRequests,
      },
      events: { total: totalEvents, published: publishedEvents },
      registrations: { total: totalRegistrations },
      revenue: { totalPaid: revenueAgg._sum.totalAmount ?? 0 },
      // Ops overview additions (notifications).
      push: {
        sentLast30Days: pushSent30d,
        failedLast30Days: pushFailed30d,
        deliveryRatePercent: pushDeliveryRate,
      },
      generatedAt: now.toISOString(),
    };
  }

  /**
   * Resolve an analytics range key into a bucketed Asia/Kolkata time window.
   * Granularity follows the range so a chart never has one giant bar or ten
   * thousand slivers: `today` → hourly, `7d`/`1m` → daily, `6m`/`12m`/`24m` →
   * monthly. Shared by every time-series so their x-axes line up exactly.
   *
   * India observes no DST, so IST is a fixed UTC+5:30 — we derive IST wall-clock
   * fields by shifting a UTC instant by the offset and reading its UTC getters,
   * with no timezone library. `buckets` runs oldest → newest; each `key` matches
   * the Postgres `to_char(date_trunc(...))` output for that granularity exactly.
   * `earliest` is the start of the oldest bucket (seeds cumulative baselines);
   * `windowStart` adds a day of slack so a boundary row is never dropped.
   * `bucketExpr(col)` builds the matching SQL bucket expression (safe: trunc /
   * format / column are internal constants, never user input).
   */
  private istWindow(range: string) {
    const IST = 5.5 * 60 * 60 * 1000;
    const DAY = 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const istNow = new Date(nowMs + IST); // read getUTC* → IST wall-clock
    const y = istNow.getUTCFullYear();
    const mo = istNow.getUTCMonth();
    const d = istNow.getUTCDate();
    const h = istNow.getUTCHours();

    // IST wall-clock components → the true UTC instant of that wall-clock time.
    const istToUtc = (yy: number, mm: number, dd: number, hh = 0) =>
      Date.UTC(yy, mm, dd, hh) - IST;

    type Gran = 'hour' | 'day' | 'month';
    const keyOf = (utcMs: number, gran: Gran) => {
      const p = new Date(utcMs + IST);
      const Y = p.getUTCFullYear();
      const M = String(p.getUTCMonth() + 1).padStart(2, '0');
      const D = String(p.getUTCDate()).padStart(2, '0');
      const H = String(p.getUTCHours()).padStart(2, '0');
      if (gran === 'hour') return `${Y}-${M}-${D} ${H}`;
      if (gran === 'day') return `${Y}-${M}-${D}`;
      return `${Y}-${M}`;
    };
    const labelOf = (utcMs: number, gran: Gran) => {
      const opts: Intl.DateTimeFormatOptions =
        gran === 'hour'
          ? { hour: 'numeric', hour12: true }
          : gran === 'day'
            ? { day: 'numeric', month: 'short' }
            : { month: 'short', year: 'numeric' };
      return new Date(utcMs).toLocaleString('en-US', {
        timeZone: 'Asia/Kolkata',
        ...opts,
      });
    };

    let gran: Gran;
    const buckets: { key: string; label: string }[] = [];
    let earliestMs: number;

    if (range === 'today') {
      gran = 'hour';
      const dayStart = istToUtc(y, mo, d, 0);
      for (let i = 0; i <= h; i++) {
        const t = dayStart + i * 60 * 60 * 1000;
        buckets.push({ key: keyOf(t, gran), label: labelOf(t, gran) });
      }
      earliestMs = dayStart;
    } else if (range === '7d' || range === '1m') {
      gran = 'day';
      const span = range === '7d' ? 7 : 30;
      const todayStart = istToUtc(y, mo, d, 0);
      earliestMs = todayStart - (span - 1) * DAY;
      for (let i = span - 1; i >= 0; i--) {
        const t = todayStart - i * DAY;
        buckets.push({ key: keyOf(t, gran), label: labelOf(t, gran) });
      }
    } else {
      gran = 'month';
      const span = range === '6m' ? 6 : range === '24m' ? 24 : 12;
      for (let i = span - 1; i >= 0; i--) {
        const t = istToUtc(y, mo - i, 1, 0);
        buckets.push({ key: keyOf(t, gran), label: labelOf(t, gran) });
      }
      earliestMs = istToUtc(y, mo - (span - 1), 1, 0);
    }

    const FMT: Record<Gran, string> = {
      hour: 'YYYY-MM-DD HH24',
      day: 'YYYY-MM-DD',
      month: 'YYYY-MM',
    };
    const fmt = FMT[gran];
    const bucketExpr = (col: string) =>
      Prisma.raw(
        `to_char(date_trunc('${gran}', ${col} AT TIME ZONE 'Asia/Kolkata'), '${fmt}')`,
      );

    return {
      gran,
      buckets,
      earliest: new Date(earliestMs),
      windowStart: new Date(earliestMs - DAY),
      bucketExpr,
    };
  }

  /**
   * Financial time-series behind the Analytics financial graphs. Sales AND their
   * refunds are both dated to the SALE bucket (a refund via its linked
   * registration's `registered_at`), so a refund nets against the exact revenue
   * it reverses — an accrual view. Completed payouts are dated by `completed_at`
   * (when cash left). `range` picks the window + granularity (see `istWindow`);
   * missing buckets are back-filled with zeros so the chart never has holes.
   */
  async getFinancialTimeseries(range = '12m') {
    const now = new Date();
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const { buckets, windowStart, bucketExpr } = this.istWindow(range);

    const [regRows, refundRows, payoutRows] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ period: string; collected: string; fees: string; registrations: number }>
      >(Prisma.sql`
        SELECT ${bucketExpr('registered_at')} AS period,
               SUM(total_amount) AS collected,
               SUM(processing_fee) AS fees,
               COUNT(*)::int AS registrations
        FROM event_registrations
        WHERE payment_status::text IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
          AND registered_at >= ${windowStart}
        GROUP BY 1
      `),
      this.prisma.$queryRaw<Array<{ period: string; refunded: string }>>(Prisma.sql`
        SELECT ${bucketExpr('er.registered_at')} AS period,
               SUM(rr.cash_refunded) AS refunded
        FROM refund_requests rr
        JOIN event_registrations er ON er.id = rr.registration_id
        WHERE rr.status::text = 'APPROVED'
          AND er.registered_at >= ${windowStart}
        GROUP BY 1
      `),
      this.prisma.$queryRaw<Array<{ period: string; settled: string }>>(Prisma.sql`
        SELECT ${bucketExpr('COALESCE(completed_at, created_at)')} AS period,
               SUM(net_amount) AS settled
        FROM payouts
        WHERE status::text = 'COMPLETED'
          AND COALESCE(completed_at, created_at) >= ${windowStart}
        GROUP BY 1
      `),
    ]);

    const regMap = new Map(regRows.map((r) => [r.period, r]));
    const refundMap = new Map(refundRows.map((r) => [r.period, r]));
    const payoutMap = new Map(payoutRows.map((r) => [r.period, r]));

    const series = buckets.map(({ key, label }) => {
      const reg = regMap.get(key);
      const collected = Number(reg?.collected ?? 0);
      const fees = Number(reg?.fees ?? 0);
      const ticketRevenue = collected - fees;
      const refunded = Number(refundMap.get(key)?.refunded ?? 0);
      const settled = Number(payoutMap.get(key)?.settled ?? 0);
      return {
        period: key,
        label,
        collected: round2(collected),
        ticketRevenue: round2(ticketRevenue),
        processingFees: round2(fees),
        refunded: round2(refunded),
        netRevenue: round2(ticketRevenue - refunded),
        settled: round2(settled),
        registrations: reg?.registrations ?? 0,
      };
    });

    return { months: series, generatedAt: now.toISOString() };
  }

  /**
   * Growth time-series behind the Analytics user / space / event graphs. Same
   * Asia/Kolkata buckets as the financial series so every chart on the dashboard
   * shares one x-axis. For each entity we return BOTH the count created in the
   * bucket ("new") and the running platform total at bucket end ("cumulative") —
   * the cumulative line is seeded with a baseline of rows that existed before
   * the window so totals reflect reality, not just the window.
   *
   * Also returns current status distributions for events and spaces (for the
   * breakdown donuts), which are point-in-time snapshots, not time-bucketed.
   *
   * `range` picks the window + granularity (see `istWindow`). Missing buckets
   * are back-filled with zeros so the charts never have holes.
   */
  async getGrowthTimeseries(range = '12m') {
    const now = new Date();
    const { buckets, earliest, windowStart, bucketExpr } = this.istWindow(range);

    // One grouped-by-IST-bucket query per entity. `publishedEvents` counts
    // events CREATED in the bucket that are currently PUBLISHED — a proxy for
    // "how many of that period's events went live".
    const [
      userRows,
      spaceRows,
      eventRows,
      regRows,
      usersBefore,
      spacesBefore,
      eventsBefore,
      eventsByStatus,
      spacesByStatus,
    ] = await Promise.all([
      this.prisma.$queryRaw<Array<{ period: string; count: number }>>(Prisma.sql`
        SELECT ${bucketExpr('created_at')} AS period,
               COUNT(*)::int AS count
        FROM users
        WHERE created_at >= ${windowStart}
        GROUP BY 1
      `),
      this.prisma.$queryRaw<Array<{ period: string; count: number }>>(Prisma.sql`
        SELECT ${bucketExpr('created_at')} AS period,
               COUNT(*)::int AS count
        FROM spaces
        WHERE created_at >= ${windowStart}
        GROUP BY 1
      `),
      this.prisma.$queryRaw<
        Array<{ period: string; count: number; published: number }>
      >(Prisma.sql`
        SELECT ${bucketExpr('created_at')} AS period,
               COUNT(*)::int AS count,
               COUNT(*) FILTER (WHERE status::text = 'PUBLISHED')::int AS published
        FROM events
        WHERE created_at >= ${windowStart}
        GROUP BY 1
      `),
      this.prisma.$queryRaw<Array<{ period: string; count: number }>>(Prisma.sql`
        SELECT ${bucketExpr('registered_at')} AS period,
               COUNT(*)::int AS count
        FROM event_registrations
        WHERE registered_at >= ${windowStart}
        GROUP BY 1
      `),
      // Baselines: rows that already existed before the earliest bucket.
      this.prisma.user.count({ where: { createdAt: { lt: earliest } } }),
      this.prisma.space.count({ where: { createdAt: { lt: earliest } } }),
      this.prisma.event.count({ where: { createdAt: { lt: earliest } } }),
      // Point-in-time status snapshots for the breakdown donuts.
      this.prisma.event.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.space.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    const toMap = (rows: Array<{ period: string; count: number }>) =>
      new Map(rows.map((r) => [r.period, r.count]));
    const userMap = toMap(userRows);
    const spaceMap = toMap(spaceRows);
    const eventMap = toMap(eventRows);
    const regMap = toMap(regRows);
    const publishedMap = new Map(eventRows.map((r) => [r.period, r.published]));

    // Running totals seeded with the pre-window baseline.
    let cumUsers = usersBefore;
    let cumSpaces = spacesBefore;
    let cumEvents = eventsBefore;

    const series = buckets.map(({ key, label }) => {
      const newUsers = userMap.get(key) ?? 0;
      const newSpaces = spaceMap.get(key) ?? 0;
      const newEvents = eventMap.get(key) ?? 0;
      cumUsers += newUsers;
      cumSpaces += newSpaces;
      cumEvents += newEvents;
      return {
        period: key,
        label,
        newUsers,
        cumulativeUsers: cumUsers,
        newSpaces,
        cumulativeSpaces: cumSpaces,
        newEvents,
        publishedEvents: publishedMap.get(key) ?? 0,
        cumulativeEvents: cumEvents,
        newRegistrations: regMap.get(key) ?? 0,
      };
    });

    return {
      months: series,
      eventsByStatus: eventsByStatus.map((r) => ({
        status: r.status,
        count: r._count._all,
      })),
      spacesByStatus: spacesByStatus.map((r) => ({
        status: r.status,
        count: r._count._all,
      })),
      generatedAt: now.toISOString(),
    };
  }

  /**
   * List ALL spaces across the platform (ADMIN only), mapped to the shape the
   * Apex dashboard expects. Each space is annotated with its member-role
   * breakdown (Space Admin / Member).
   */
  async getAllSpacesAdmin(params: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const { page = 1, limit = 20, search } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [spaces, total] = await Promise.all([
      this.prisma.space.findMany({
        where,
        skip,
        take: limit,
        include: {
          creator: {
            select: { id: true, fullName: true, username: true },
          },
          parentSpace: {
            select: { id: true, name: true, slug: true },
          },
          userRoles: {
            select: { role: { select: { code: true } } },
          },
          _count: { select: { userRoles: true, childSpaces: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.space.count({ where }),
    ]);

    const mapped = spaces.map((space) => {
      const roleCounts = { spaceAdmins: 0, members: 0 };
      for (const ur of space.userRoles) {
        switch (ur.role?.code) {
          case 'SPACE_ADMIN':
            roleCounts.spaceAdmins += 1;
            break;
          case 'MEMBER':
            roleCounts.members += 1;
            break;
        }
      }
      return {
        id: space.id,
        name: space.name,
        slug: space.slug,
        description: space.description,
        logo_url: space.logoUrl,
        banner_url: space.bannerUrl,
        city: space.city,
        state: space.state,
        country: space.country,
        visibility: space.visibility,
        status: space.status,
        // SUPER (parent) or REGULAR (individual / child).
        type: space.type,
        parent_space_id: space.parentSpaceId,
        parentSpace: space.parentSpace,
        child_count: space._count.childSpaces,
        member_count: space._count.userRoles,
        roleCounts,
        rejection_reason: space.rejectionReason,
        // Current white-label state, so admin tools start from what's live.
        white_label_enabled: space.whiteLabelEnabled,
        brand_color: space.brandColor,
        creator: space.creator,
        createdAt: space.createdAt,
        updatedAt: space.updatedAt,
      };
    });

    return {
      spaces: mapped,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Approve a pending space (ADMIN only). Moves the space out of the review
   * queue and makes it live.
   */
  async approveSpace(id: string, adminId: string) {
    const space = await this.prisma.space.findUnique({ where: { id } });
    if (!space) {
      throw new NotFoundException('Space not found');
    }
    if (space.status === SpaceStatus.APPROVED || space.status === SpaceStatus.ACTIVE) {
      throw new BadRequestException('Space is already approved');
    }

    const updated = await this.prisma.space.update({
      where: { id },
      data: {
        status: SpaceStatus.APPROVED,
        approvedAt: new Date(),
        approvedBy: adminId,
        rejectedAt: null,
        rejectionReason: null,
      },
      select: { id: true, name: true, status: true, approvedAt: true, approvedBy: true },
    });
    this.logger.log(`Space ${id} approved by admin ${adminId}`);
    return updated;
  }

  /**
   * Reject a pending space (ADMIN only), recording the reason shown to the
   * organiser.
   */
  async rejectSpace(id: string, adminId: string, reason?: string) {
    const space = await this.prisma.space.findUnique({ where: { id } });
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    const updated = await this.prisma.space.update({
      where: { id },
      data: {
        status: SpaceStatus.REJECTED,
        rejectedAt: new Date(),
        approvedBy: adminId,
        rejectionReason: reason?.trim() || null,
      },
      select: {
        id: true,
        name: true,
        status: true,
        rejectedAt: true,
        rejectionReason: true,
      },
    });
    this.logger.log(`Space ${id} rejected by admin ${adminId}`);
    return updated;
  }

  /**
   * Manage a space's lifecycle state (ADMIN only) — e.g. ACTIVE, INACTIVE,
   * SUSPENDED, ARCHIVED. Approval/rejection have dedicated endpoints; this is
   * for post-approval state management.
   */
  async updateSpaceStatus(id: string, status: SpaceStatus, adminId: string) {
    const space = await this.prisma.space.findUnique({ where: { id } });
    if (!space) {
      throw new NotFoundException('Space not found');
    }
    if (!Object.values(SpaceStatus).includes(status)) {
      throw new BadRequestException(`Invalid space status: ${status}`);
    }

    const updated = await this.prisma.space.update({
      where: { id },
      data: { status },
      select: { id: true, name: true, status: true },
    });
    this.logger.log(`Space ${id} status set to ${status} by admin ${adminId}`);
    return updated;
  }

  /**
   * Admin event list. `deleted` decides which side of the soft-delete line is
   * returned; it defaults to 'active' so hidden events stay out of the way
   * unless staff explicitly ask for them.
   */
  async getAllEvents(params: {
    page: number;
    limit: number;
    status?: string;
    search?: string;
    deleted?: DeletedFilter;
    /** Only events hosted by this space. */
    spaceId?: string;
  }) {
    const { page, limit, status, search, deleted, spaceId } = params;
    const skip = (page - 1) * limit;

    const where: any = { ...deletedWhere(deleted ?? 'active') };
    if (status) where.status = status;
    if (spaceId) where.spaceId = spaceId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          space: { select: { id: true, name: true, slug: true } },
          creator: {
            select: {
              id: true,
              fullName: true,
              username: true,
              mobileNumber: true,
              identities: { where: { email: { not: null } }, select: { email: true }, take: 1 },
            },
          },
          ticketTypes: {
            select: { id: true, name: true, price: true, kind: true, soldCount: true },
          },
          // Sub-event hierarchy so the admin list can badge big events/sub-events.
          parentEvent: { select: { id: true, title: true, slug: true } },
          _count: { select: { registrations: true, childEvents: true } },
        },
      }),
      this.prisma.event.count({ where }),
    ]);

    // Per-event paid sales (gross + fees + paid count) in one grouped query.
    const eventIds = events.map((e) => e.id);
    const salesAgg = eventIds.length
      ? await this.prisma.eventRegistration.groupBy({
          by: ['eventId'],
          where: { eventId: { in: eventIds }, paymentStatus: PaymentStatus.PAID },
          _sum: { totalAmount: true, processingFee: true, refundedAmount: true },
          _count: { _all: true },
        })
      : [];
    const salesMap = new Map(
      salesAgg.map((s) => [
        s.eventId,
        {
          grossSales: Number(s._sum.totalAmount ?? 0),
          processingFees: Number(s._sum.processingFee ?? 0),
          refunded: Number(s._sum.refundedAmount ?? 0),
          paidRegistrations: s._count._all,
        },
      ]),
    );

    const enriched = events.map((e) => {
      const { identities, ...creator } = e.creator as any;
      return {
        ...e,
        creator: { ...creator, email: identities?.[0]?.email ?? null },
        sales:
          salesMap.get(e.id) ?? {
            grossSales: 0,
            processingFees: 0,
            refunded: 0,
            paidRegistrations: 0,
          },
      };
    });

    return {
      events: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * One event in full for the admin detail page (ADMIN only). Includes drafts
   * and soft-deleted events — this is a moderation surface, so nothing is
   * hidden. Rolls up the same paid-sales aggregates as {@link getAllEvents},
   * but per ticket type, plus a confirmed-attendee headcount and the most
   * recent registrations.
   */
  async getEventById(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        space: { select: { id: true, name: true, slug: true } },
        creator: {
          select: {
            id: true,
            fullName: true,
            username: true,
            mobileNumber: true,
            identities: {
              where: { email: { not: null } },
              select: { email: true },
              take: 1,
            },
          },
        },
        ticketTypes: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            name: true,
            price: true,
            kind: true,
            totalQuantity: true,
            soldCount: true,
          },
        },
        parentEvent: { select: { id: true, title: true, slug: true } },
        childEvents: {
          where: { deletedAt: null },
          orderBy: { startDateTime: 'asc' },
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            startDateTime: true,
            registeredCount: true,
          },
        },
        _count: { select: { registrations: true, childEvents: true } },
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Rolled-up paid sales for the whole event (gross, fees, refunds, count).
    const salesAgg = await this.prisma.eventRegistration.aggregate({
      where: { eventId: id, paymentStatus: PaymentStatus.PAID },
      _sum: { totalAmount: true, processingFee: true, refundedAmount: true },
      _count: { _all: true },
    });
    const sales = {
      grossSales: Number(salesAgg._sum.totalAmount ?? 0),
      processingFees: Number(salesAgg._sum.processingFee ?? 0),
      refunded: Number(salesAgg._sum.refundedAmount ?? 0),
      paidRegistrations: salesAgg._count._all,
    };

    // Confirmed attendees — the shared COUNTS_AS_ATTENDING bar so this number
    // agrees with check-in and the organiser's own headcount.
    const attendeeCount = await this.prisma.eventRegistration.count({
      where: { eventId: id, ...COUNTS_AS_ATTENDING },
    });

    // Per-ticket-type paid sales, grouped in one query and folded onto types.
    const perTypeAgg = event.ticketTypes.length
      ? await this.prisma.eventRegistration.groupBy({
          by: ['ticketTypeId'],
          where: {
            eventId: id,
            paymentStatus: PaymentStatus.PAID,
            ticketTypeId: { in: event.ticketTypes.map((t) => t.id) },
          },
          _sum: { totalAmount: true },
          _count: { _all: true },
        })
      : [];
    const perTypeMap = new Map(
      perTypeAgg.map((r) => [
        r.ticketTypeId,
        {
          grossSales: Number(r._sum.totalAmount ?? 0),
          paidRegistrations: r._count._all,
        },
      ]),
    );

    // Most recent registrations for a moderation glance at who's coming.
    const recentRegistrations = await this.prisma.eventRegistration.findMany({
      where: { eventId: id },
      orderBy: { registeredAt: 'desc' },
      take: 10,
      select: {
        id: true,
        quantity: true,
        totalAmount: true,
        refundedAmount: true,
        paymentStatus: true,
        status: true,
        registeredAt: true,
        user: {
          select: { id: true, fullName: true, username: true },
        },
        ticketType: { select: { id: true, name: true } },
      },
    });

    const { identities, ...creator } = event.creator as any;
    return {
      ...event,
      creator: { ...creator, email: identities?.[0]?.email ?? null },
      // Normalise ticket type shape: expose `quantity` and fold in per-type sales.
      ticketTypes: event.ticketTypes.map(({ totalQuantity, ...t }) => ({
        ...t,
        quantity: totalQuantity,
        sales: perTypeMap.get(t.id) ?? { grossSales: 0, paidRegistrations: 0 },
      })),
      sales,
      attendeeCount,
      // Expose `registeredAt` as `createdAt` so the client speaks one language.
      recentRegistrations: recentRegistrations.map(({ registeredAt, ...r }) => ({
        ...r,
        createdAt: registeredAt,
      })),
    };
  }

  /**
   * List all sessions incl. drafts for moderation (ADMIN only). Mirrors
   * getAllEvents: paginated, filterable, with per-session paid sales.
   */
  /** Admin session list. See `getAllEvents` for the `deleted` filter. */
  async getAllSessions(params: {
    page: number;
    limit: number;
    status?: string;
    search?: string;
    deleted?: DeletedFilter;
  }) {
    const { page, limit, status, search, deleted } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.SessionWhereInput = {
      ...deletedWhere(deleted ?? 'active'),
    };
    if (status) where.status = status as Prisma.EnumSessionStatusFilter['equals'];
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [sessions, total] = await Promise.all([
      this.prisma.session.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          space: { select: { id: true, name: true, slug: true } },
          creator: {
            select: {
              id: true,
              fullName: true,
              username: true,
              mobileNumber: true,
              identities: {
                where: { email: { not: null } },
                select: { email: true },
                take: 1,
              },
            },
          },
          _count: { select: { registrations: true } },
        },
      }),
      this.prisma.session.count({ where }),
    ]);

    // Per-session paid sales (gross + fees + refunds + paid count) in one query.
    const sessionIds = sessions.map((s) => s.id);
    const salesAgg = sessionIds.length
      ? await this.prisma.sessionRegistration.groupBy({
          by: ['sessionId'],
          where: {
            sessionId: { in: sessionIds },
            paymentStatus: PaymentStatus.PAID,
          },
          _sum: {
            totalAmount: true,
            processingFee: true,
            refundedAmount: true,
          },
          _count: { _all: true },
        })
      : [];
    const salesMap = new Map(
      salesAgg.map((s) => [
        s.sessionId,
        {
          grossSales: Number(s._sum.totalAmount ?? 0),
          processingFees: Number(s._sum.processingFee ?? 0),
          refunded: Number(s._sum.refundedAmount ?? 0),
          paidRegistrations: s._count._all,
        },
      ]),
    );

    const enriched = sessions.map((s) => {
      const { identities, ...creator } = s.creator as typeof s.creator & {
        identities?: { email: string | null }[];
      };
      return {
        ...s,
        creator: { ...creator, email: identities?.[0]?.email ?? null },
        sales:
          salesMap.get(s.id) ?? {
            grossSales: 0,
            processingFees: 0,
            refunded: 0,
            paidRegistrations: 0,
          },
      };
    });

    return {
      sessions: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * One session in full for moderation (ADMIN only): all fields incl. the
   * meeting link, plus its attendees with payment state.
   */
  async getSessionDetail(id: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: {
        space: { select: { id: true, name: true, slug: true } },
        creator: {
          select: {
            id: true,
            fullName: true,
            username: true,
            mobileNumber: true,
            identities: {
              where: { email: { not: null } },
              select: { email: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('Session not found');

    const registrations = await this.prisma.sessionRegistration.findMany({
      where: { sessionId: id },
      orderBy: { registeredAt: 'desc' },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        totalAmount: true,
        refundedAmount: true,
        joinedAt: true,
        registeredAt: true,
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            mobileNumber: true,
            identities: {
              where: { email: { not: null } },
              select: { email: true },
              take: 1,
            },
          },
        },
      },
    });

    const { identities, ...creator } = session.creator as typeof session.creator & {
      identities?: { email: string | null }[];
    };

    return {
      ...session,
      creator: { ...creator, email: identities?.[0]?.email ?? null },
      attendees: registrations.map(({ user, ...reg }) => {
        const { identities: uid, ...u } = user as typeof user & {
          identities?: { email: string | null }[];
        };
        return { ...reg, user: { ...u, email: uid?.[0]?.email ?? null } };
      }),
    };
  }

  /**
   * Platform-wide payments ledger: every registration that moved money, with a
   * summary (gross volume, successful count, failed count). Free RSVPs (₹0, no
   * payment id) are excluded so the ledger only shows real transactions.
   */
  async getTransactions(params: {
    page: number;
    limit: number;
    status?: string;
    search?: string;
  }) {
    const { page, limit, status, search } = params;
    const skip = (page - 1) * limit;

    // Registrations that represent a payment transaction. PENDING is included so
    // stuck/unsettled payments (a captured or failed Razorpay charge whose
    // webhook never landed) are visible and can be reconciled from the admin
    // transactions view rather than being silently hidden.
    const moneyStatuses: PaymentStatus[] = [
      PaymentStatus.PENDING,
      PaymentStatus.PAID,
      PaymentStatus.FAILED,
      PaymentStatus.REFUNDED,
      PaymentStatus.PARTIALLY_REFUNDED,
    ];

    const where: Prisma.EventRegistrationWhereInput = {
      paymentStatus: status
        ? (status as PaymentStatus)
        : { in: moneyStatuses },
    };
    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { paymentId: { contains: term, mode: 'insensitive' } },
        { orderId: { contains: term, mode: 'insensitive' } },
        { event: { title: { contains: term, mode: 'insensitive' } } },
        { user: { fullName: { contains: term, mode: 'insensitive' } } },
        { user: { username: { contains: term, mode: 'insensitive' } } },
        {
          user: {
            identities: { some: { email: { contains: term, mode: 'insensitive' } } },
          },
        },
      ];
    }

    const [rows, total, paidAgg, successful, failed] = await Promise.all([
      this.prisma.eventRegistration.findMany({
        where,
        skip,
        take: limit,
        orderBy: { registeredAt: 'desc' },
        select: {
          id: true,
          totalAmount: true,
          processingFee: true,
          refundedAmount: true,
          paymentStatus: true,
          paymentId: true,
          orderId: true,
          paidAt: true,
          registeredAt: true,
          event: {
            select: {
              id: true,
              title: true,
              slug: true,
              space: { select: { id: true, name: true, slug: true } },
            },
          },
          ticketType: { select: { name: true } },
          user: {
            select: {
              id: true,
              fullName: true,
              username: true,
              identities: { where: { email: { not: null } }, select: { email: true }, take: 1 },
            },
          },
        },
      }),
      this.prisma.eventRegistration.count({ where }),
      // Gross volume + successful count are always platform-wide (unaffected by filters).
      this.prisma.eventRegistration.aggregate({
        where: { paymentStatus: PaymentStatus.PAID },
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.eventRegistration.count({ where: { paymentStatus: PaymentStatus.PAID } }),
      this.prisma.eventRegistration.count({ where: { paymentStatus: PaymentStatus.FAILED } }),
    ]);

    const transactions = rows.map((r) => ({
      ...r,
      user: {
        id: r.user.id,
        fullName: r.user.fullName,
        username: r.user.username,
        email: r.user.identities?.[0]?.email ?? null,
      },
    }));

    return {
      transactions,
      summary: {
        grossVolume: Number(paidAgg._sum.totalAmount ?? 0),
        successful,
        failed,
      },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Full detail for a single ledger transaction (one EventRegistration that
   * moved money). Surfaces the complete money breakdown plus the answer to
   * "which organiser/space, which event, which attendee" — the space and its
   * creator (the organiser) are walked via event → space → creator. Refund
   * requests are included so an admin can see the two-stage refund history.
   */
  async getTransaction(id: string) {
    const r = await this.prisma.eventRegistration.findUnique({
      where: { id },
      select: {
        id: true,
        quantity: true,
        groupSize: true,
        totalAmount: true,
        razorpayAmount: true,
        processingFee: true,
        refundedAmount: true,
        paymentStatus: true,
        paymentId: true,
        orderId: true,
        paidAt: true,
        status: true,
        registeredAt: true,
        cancelledAt: true,
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            type: true,
            startDateTime: true,
            space: {
              select: {
                id: true,
                name: true,
                slug: true,
                plan: true,
                status: true,
                creator: {
                  select: {
                    id: true,
                    fullName: true,
                    username: true,
                    identities: {
                      where: { email: { not: null } },
                      select: { email: true },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        },
        ticketType: { select: { name: true } },
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            mobileNumber: true,
            identities: {
              where: { email: { not: null } },
              select: { email: true },
              take: 1,
            },
          },
        },
        tickets: {
          select: {
            id: true,
            ticketCode: true,
            attendeeName: true,
            attendeeEmail: true,
            status: true,
            checkedInAt: true,
          },
        },
        refundRequests: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            reason: true,
            requestedAmount: true,
            approvedAmount: true,
            cashRefunded: true,
            requesterRole: true,
            createdAt: true,
          },
        },
      },
    });

    if (!r) throw new NotFoundException('Transaction not found');

    const organiser = r.event.space.creator;

    return {
      transaction: {
        id: r.id,
        quantity: r.quantity,
        groupSize: r.groupSize,
        totalAmount: r.totalAmount,
        razorpayAmount: r.razorpayAmount,
        processingFee: r.processingFee,
        refundedAmount: r.refundedAmount,
        paymentStatus: r.paymentStatus,
        paymentId: r.paymentId,
        orderId: r.orderId,
        paidAt: r.paidAt,
        status: r.status,
        registeredAt: r.registeredAt,
        cancelledAt: r.cancelledAt,
        ticketType: r.ticketType,
        event: {
          id: r.event.id,
          title: r.event.title,
          slug: r.event.slug,
          status: r.event.status,
          type: r.event.type,
          startDateTime: r.event.startDateTime,
        },
        space: {
          id: r.event.space.id,
          name: r.event.space.name,
          slug: r.event.space.slug,
          plan: r.event.space.plan,
          status: r.event.space.status,
        },
        organiser: {
          id: organiser.id,
          fullName: organiser.fullName,
          username: organiser.username,
          email: organiser.identities?.[0]?.email ?? null,
        },
        user: {
          id: r.user.id,
          fullName: r.user.fullName,
          username: r.user.username,
          mobileNumber: r.user.mobileNumber,
          email: r.user.identities?.[0]?.email ?? null,
        },
        tickets: r.tickets,
        refundRequests: r.refundRequests,
      },
    };
  }

  /**
   * Recompute every event's registeredCount and every ticket type's soldCount
   * from the live registrations, counting a group as `groupSize` seats (not 1).
   *
   * Run this ONCE after deploying the seat-counting change: historical group
   * bookings were counted as a single seat, so the stored counters are stale
   * and would otherwise drift (or go negative when an old group is cancelled).
   * A registration occupies seats when it is confirmed (PAID or partially
   * refunded), not cancelled, and not waitlisted — mirroring the increment /
   * decrement conditions in the registration + refund flows. A waiting list
   * OFFERED row also holds its ticket seat (WaitlistService takes it on offer)
   * but is not an attendee, so it counts toward soldCount only. Idempotent.
   */
  async reconcileSeatCounts() {
    const CONFIRMED = "payment_status IN ('PAID','PARTIALLY_REFUNDED')";
    const ACTIVE = `status <> 'CANCELLED' AND is_waitlisted = false AND ${CONFIRMED}`;
    const HOLDS_TICKET_SEAT = `(${ACTIVE}) OR (status <> 'CANCELLED' AND waitlist_status = 'OFFERED')`;

    // All four statements run in ONE transaction so counts are never observed
    // at the intermediate reset-to-zero state by concurrent reads.
    const [ticketTypesReset, eventsReset] = await this.prisma.$transaction([
      this.prisma.$executeRawUnsafe(`UPDATE event_ticket_types SET sold_count = 0`),
      this.prisma.$executeRawUnsafe(`UPDATE events SET registered_count = 0`),
      this.prisma.$executeRawUnsafe(`
        UPDATE event_ticket_types t
        SET sold_count = sub.seats
        FROM (
          SELECT ticket_type_id, SUM(COALESCE(group_size, quantity))::int AS seats
          FROM event_registrations
          WHERE ticket_type_id IS NOT NULL AND (${HOLDS_TICKET_SEAT})
          GROUP BY ticket_type_id
        ) sub
        WHERE t.id = sub.ticket_type_id
      `),
      this.prisma.$executeRawUnsafe(`
        UPDATE events e
        SET registered_count = sub.seats
        FROM (
          SELECT event_id, SUM(COALESCE(group_size, quantity))::int AS seats
          FROM event_registrations
          WHERE ${ACTIVE}
          GROUP BY event_id
        ) sub
        WHERE e.id = sub.event_id
      `),
    ]);

    this.logger.log(
      `Seat-count reconciliation complete (reset ${ticketTypesReset} ticket types, ${eventsReset} events)`,
    );
    return { success: true, ticketTypesReset, eventsReset };
  }

}
