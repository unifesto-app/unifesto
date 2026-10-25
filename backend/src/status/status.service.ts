import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IncidentImpact, IncidentStatus } from '@prisma/client';
import { monitorEventLoopDelay } from 'perf_hooks';
import { getHeapStatistics } from 'v8';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from '../admin/admin.service';
import { RedisService } from '../redis/redis.service';
import { NotificationEvents } from '../notifications/notifications.constants';
import type { StatusIncidentEvent } from '../notifications/notifications.events';

/** Tracked services, in display order. */
export const STATUS_SERVICES = [
  { key: 'api', name: 'API & Dashboard' },
  { key: 'database', name: 'Database' },
  { key: 'redis', name: 'Redis cache' },
  { key: 'storage', name: 'Storage (S3)' },
] as const;

const HISTORY_DAYS = 90;
/** Past-incidents window the status page shows, day by day. */
const INCIDENT_DAYS = 14;
/** Samples run every 5 min; no sample for 3 ticks means sampling has stopped. */
const STALE_AFTER_MS = 15 * 60 * 1000;
/** Consecutive down samples before an incident is opened automatically. */
const AUTO_INCIDENT_AFTER = 2;

/* API health thresholds — the process answering proves little on its own. */
const API_MAX_LOOP_LAG_MS = 500; // p99 event-loop delay over the last window
const API_MAX_HEAP_RATIO = 0.9; // of V8's heap limit (NODE_OPTIONS caps it)
const API_MAX_5XX_RATIO = 0.2; // share of requests in the window
const API_MIN_REQUESTS = 20; // below this the 5xx ratio is noise

/** Auto-incident impact per service: DB/API down breaks everything. */
const AUTO_IMPACT: Record<string, IncidentImpact> = {
  api: IncidentImpact.MAJOR,
  database: IncidentImpact.CRITICAL,
  redis: IncidentImpact.MAJOR,
  storage: IncidentImpact.MINOR,
};

export type OverallStatus =
  | 'operational'
  | 'degraded'
  | 'major_outage'
  | 'unknown';

const OVERALL_RANK: Record<OverallStatus, number> = {
  operational: 0,
  unknown: 1,
  degraded: 2,
  major_outage: 3,
};

function worst(a: OverallStatus, b: OverallStatus): OverallStatus {
  return OVERALL_RANK[a] >= OVERALL_RANK[b] ? a : b;
}

/** What unresolved incidents alone say about the platform. */
function overallFromIncidents(
  open: { impact: IncidentImpact }[],
): OverallStatus {
  if (open.some((i) => i.impact === IncidentImpact.CRITICAL)) {
    return 'major_outage';
  }
  if (
    open.some(
      (i) => i.impact === IncidentImpact.MAJOR || i.impact === IncidentImpact.MINOR,
    )
  ) {
    return 'degraded';
  }
  // NONE = scheduled maintenance / informational: shown, never turns it red.
  return 'operational';
}

export interface DayBucket {
  date: string; // YYYY-MM-DD (UTC)
  status: 'up' | 'down' | 'partial' | 'nodata';
  uptime: number | null;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Milliseconds of `day` (UTC, YYYY-MM-DD) that incidents marked `service` down.
 * The samples come from the API checking itself, so they can't see a dead
 * host, a Caddy 502 storm or 429s; incidents (auto or reported) can. NONE is
 * maintenance/info and never counts; an incident with no services listed
 * counts against the API. Overlapping incidents are merged, not summed.
 */
export function incidentDownMs(
  incidents: { impact: IncidentImpact; affectedServices: string[]; startedAt: Date; resolvedAt: Date | null }[],
  service: string,
  day: string,
  now: number,
): number {
  const dayStart = Date.parse(`${day}T00:00:00Z`);
  const dayEnd = Math.min(dayStart + DAY_MS, now);
  const spans = incidents
    .filter(
      (i) =>
        i.impact !== IncidentImpact.NONE &&
        (i.affectedServices.length ? i.affectedServices.includes(service) : service === 'api'),
    )
    .map((i) => [Math.max(+i.startedAt, dayStart), Math.min(i.resolvedAt ? +i.resolvedAt : now, dayEnd)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let end = -Infinity;
  for (const [a, b] of spans) {
    if (b <= end) continue;
    total += b - Math.max(a, end);
    end = b;
  }
  return total;
}

@Injectable()
export class StatusService {
  private readonly logger = new Logger(StatusService.name);
  /** Event-loop delay histogram, read + reset on every sample. */
  private readonly loopDelay = monitorEventLoopDelay({ resolution: 20 });

  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: AdminService,
    private readonly redis: RedisService,
    private readonly events: EventEmitter2,
  ) {
    this.loopDelay.enable();
  }

  /** Sample every service's health on a schedule for the uptime history. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async sample(): Promise<void> {
    // One sample per tick across all replicas — otherwise each of the 3 writes
    // its own 4 health rows and the uptime history is 3× inflated. fail-open:
    // if Redis is down we still want a sample recorded (it will show Redis down).
    const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
    let won = true;
    try {
      won = await this.redis.setNx(`cron:healthSample:${bucket}`, '1', 10 * 60);
    } catch {
      // Redis unreachable: replicas can't coordinate, so each records a sample.
      // Duplicates for this window beat a gap that hides the Redis outage.
    }
    if (!won) return;
    try {
      // A hole in the history means nothing was sampling: the whole backend,
      // or the DB it writes to, was down. Record it before the new sample.
      await this.recordSamplingGap();

      const [h, api] = await Promise.all([
        this.admin.getHealthStatus(),
        this.checkApiHealth(),
      ]);
      const checkedAt = new Date();
      await this.prisma.healthCheck.createMany({
        data: [
          { service: 'api', up: api.up, latencyMs: api.loopLagMs, checkedAt },
          {
            service: 'database',
            up: h.services.database.status === 'connected',
            latencyMs: h.services.database.latency ?? null,
            checkedAt,
          },
          {
            service: 'redis',
            up: h.services.redis.status === 'connected',
            latencyMs: h.services.redis.latency ?? null,
            checkedAt,
          },
          {
            service: 'storage',
            up: h.services.storage.status === 'connected',
            latencyMs: h.services.storage.latency ?? null,
            checkedAt,
          },
        ],
      });

      await this.reconcileAutoIncidents({ api: api.reason });
    } catch (err) {
      this.logger.warn(`Health sample failed: ${(err as Error).message}`);
    }
  }

  /**
   * Real API health: the process answering the cron proves nothing, so judge
   * it on event-loop lag, heap pressure and the recent 5xx rate.
   */
  private async checkApiHealth(): Promise<{
    up: boolean;
    loopLagMs: number;
    reason: string | null;
  }> {
    const loopLagMs = Math.round(this.loopDelay.percentile(99) / 1e6);
    this.loopDelay.reset();

    const heap = getHeapStatistics();
    const heapRatio = heap.used_heap_size / heap.heap_size_limit;

    const problems: string[] = [];
    if (loopLagMs > API_MAX_LOOP_LAG_MS) {
      problems.push(`event loop lag ${loopLagMs}ms`);
    }
    if (heapRatio > API_MAX_HEAP_RATIO) {
      problems.push(`heap at ${Math.round(heapRatio * 100)}% of limit`);
    }

    // api_logs lives in Postgres: if that read fails the DB check already
    // reports it, so don't double-count it against the API.
    try {
      // Real traffic only: Caddy's active health check hits `/` every 10s per
      // replica and would drown the ratio in guaranteed 200s.
      const where = {
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        path: { notIn: ['/', '/health'] },
      };
      // Sum weights: sampled 2xx GETs each stand for `weight` requests.
      const [sum, errors] = await Promise.all([
        this.prisma.apiLog.aggregate({ where, _sum: { weight: true } }),
        this.prisma.apiLog.count({
          where: { ...where, statusCode: { gte: 500 } },
        }),
      ]);
      const total = sum._sum.weight ?? 0;
      if (total >= API_MIN_REQUESTS && errors / total > API_MAX_5XX_RATIO) {
        problems.push(`${errors}/${total} requests failed with 5xx`);
      }
    } catch {
      /* DB down: surfaced by the database service */
    }

    return {
      up: problems.length === 0,
      loopLagMs,
      reason: problems.length ? problems.join(', ') : null,
    };
  }

  /**
   * Open an incident once a service has been down for AUTO_INCIDENT_AFTER
   * samples in a row, and resolve it on the first healthy sample. Auto
   * incidents are the ones with no `createdBy` (manual ones always have one).
   */
  private async reconcileAutoIncidents(
    reasons: Record<string, string | null>,
  ): Promise<void> {
    const open = await this.prisma.incident.findMany({
      where: { createdBy: null, resolvedAt: null },
    });

    for (const { key, name } of STATUS_SERVICES) {
      const recent = await this.prisma.healthCheck.findMany({
        where: { service: key },
        orderBy: { checkedAt: 'desc' },
        // One extra so we only fire as the streak *starts*: an admin closing
        // the incident by hand mid-outage must not get it reopened every tick.
        take: AUTO_INCIDENT_AFTER + 1,
        select: { up: true },
      });
      const existing = open.find((i) => i.affectedServices.includes(key));
      const latestUp = recent[0]?.up ?? true;
      const streak = recent.slice(0, AUTO_INCIDENT_AFTER);
      const streakJustStarted =
        streak.length === AUTO_INCIDENT_AFTER &&
        streak.every((r) => !r.up) &&
        (recent[AUTO_INCIDENT_AFTER]?.up ?? true);

      if (streakJustStarted && !existing) {
        const reason = reasons[key];
        const created = await this.prisma.incident.create({
          data: {
            title: `${name} is down`,
            body:
              `Detected automatically: ${AUTO_INCIDENT_AFTER} health checks in a row failed.` +
              (reason ? `\nCause: ${reason}.` : ''),
            impact: AUTO_IMPACT[key] ?? IncidentImpact.MAJOR,
            status: IncidentStatus.INVESTIGATING,
            affectedServices: [key],
            createdBy: null,
          },
        });
        this.logger.warn(`Auto incident opened: ${name} down`);
        this.alertAdmins({
          incidentId: created.id,
          kind: 'opened',
          serviceName: name,
          impact: created.impact,
          reason,
        });
      } else if (latestUp && existing) {
        const now = new Date();
        await this.prisma.incident.update({
          where: { id: existing.id },
          data: {
            status: IncidentStatus.RESOLVED,
            resolvedAt: now,
            body:
              `${existing.body ?? ''}\nRecovered automatically at ${now.toISOString()}.`.trim(),
          },
        });
        this.logger.log(`Auto incident resolved: ${name} back up`);
        this.alertAdmins({
          incidentId: existing.id,
          kind: 'resolved',
          serviceName: name,
          impact: existing.impact,
          durationMin: Math.round(
            (now.getTime() - existing.startedAt.getTime()) / 60_000,
          ),
        });
      }
    }
  }

  /**
   * If the previous sample is older than the stale threshold, nothing could
   * sample in between. Log that window as a resolved incident so an outage
   * the backend couldn't see (it was down) still shows up afterwards.
   */
  private async recordSamplingGap(): Promise<void> {
    const last = await this.prisma.healthCheck.findFirst({
      orderBy: { checkedAt: 'desc' },
      select: { checkedAt: true },
    });
    if (!last) return; // fresh install: no history, no gap
    const gapMs = Date.now() - last.checkedAt.getTime();
    if (gapMs <= STALE_AFTER_MS) return;

    const minutes = Math.round(gapMs / 60_000);
    // The first missed sample is one tick after the last good one.
    const startedAt = new Date(last.checkedAt.getTime() + 5 * 60 * 1000);
    const gap = await this.prisma.incident.create({
      data: {
        title: `No health checks for ${minutes} min`,
        body:
          'Detected automatically after health sampling resumed. The backend or its database ' +
          'was likely unreachable in this window (or every replica was restarting).',
        impact: IncidentImpact.MAJOR,
        status: IncidentStatus.RESOLVED,
        affectedServices: ['api'],
        startedAt,
        resolvedAt: new Date(),
        createdBy: null,
      },
    });
    this.logger.warn(`Sampling gap of ${minutes} min recorded as incident`);
    this.alertAdmins({
      incidentId: gap.id,
      kind: 'gap',
      serviceName: 'API & Dashboard',
      impact: gap.impact,
      durationMin: minutes,
    });
  }

  /** Fire-and-forget: the push handler fans out to every platform admin. */
  private alertAdmins(e: StatusIncidentEvent): void {
    this.events.emit(NotificationEvents.StatusIncident, e);
  }

  /** Everything the status page needs: per-service uptime bars + incidents. */
  async getSummary() {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - (HISTORY_DAYS - 1));
    since.setUTCHours(0, 0, 0, 0);

    const now = Date.now();
    // J3: aggregate in Postgres. Loading the raw rows was ~100k health_checks
    // (4 services x 288/day x 90 days) on every 30s poll.
    const [dayCounts, latestRows, downIncidents] = await Promise.all([
      this.prisma.$queryRaw<{ service: string; day: string; total: number; up: number }[]>`
        SELECT service,
               to_char(checked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
               count(*)::int AS total,
               (count(*) FILTER (WHERE up))::int AS up
        FROM health_checks
        WHERE checked_at >= ${since}
        GROUP BY 1, 2`,
      // Newest sample per service: one index seek each on (service, checked_at).
      Promise.all(
        STATUS_SERVICES.map(({ key }) =>
          this.prisma.healthCheck.findFirst({
            where: { service: key, checkedAt: { gte: since } },
            orderBy: { checkedAt: 'desc' },
            select: { service: true, up: true, latencyMs: true, checkedAt: true },
          }),
        ),
      ),
      // Every incident that overlaps the window counts against uptime.
      this.prisma.incident.findMany({
        where: {
          impact: { not: IncidentImpact.NONE },
          OR: [{ resolvedAt: null }, { resolvedAt: { gte: since } }],
        },
        select: { impact: true, affectedServices: true, startedAt: true, resolvedAt: true },
      }),
    ]);

    // Pre-build the list of day keys (oldest → today).
    const dayKeys: string[] = [];
    for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      dayKeys.push(dateKey(d));
    }

    // service -> day -> { up, total }
    const byService = new Map<string, Map<string, { up: number; total: number }>>();
    const latest = new Map<string, { up: boolean; latencyMs: number | null }>();
    let lastSampleAt: Date | null = null;
    for (const c of dayCounts) {
      if (!byService.has(c.service)) byService.set(c.service, new Map());
      byService.get(c.service)!.set(c.day, { up: c.up, total: c.total });
    }
    for (const r of latestRows) {
      if (!r) continue;
      latest.set(r.service, { up: r.up, latencyMs: r.latencyMs ?? null });
      if (!lastSampleAt || r.checkedAt > lastSampleAt) lastSampleAt = r.checkedAt;
    }
    // A dead sampler (DB or Redis down, crashed cron) would otherwise freeze the
    // last reading, usually all green. Past the threshold, current is unknown.
    const stale =
      !lastSampleAt || Date.now() - lastSampleAt.getTime() > STALE_AFTER_MS;

    const services = STATUS_SERVICES.map(({ key, name }) => {
      const dayMap = byService.get(key) ?? new Map();
      // Time-weighted: a day's uptime is the worse of what the samples saw
      // and what incidents say, so a reported outage can't hide behind green
      // self-checks.
      let upMs = 0;
      let totalMs = 0;
      const days: DayBucket[] = dayKeys.map((date) => {
        const cell = dayMap.get(date);
        const down = incidentDownMs(downIncidents, key, date, now);
        if (!cell && !down) return { date, status: 'nodata', uptime: null };
        const dayStart = Date.parse(`${date}T00:00:00Z`);
        const span = Math.max(Math.min(DAY_MS, now - dayStart), 1);
        const ratio = Math.min(cell ? cell.up / cell.total : 1, 1 - down / span);
        upMs += ratio * span;
        totalMs += span;
        const status = ratio >= 1 ? 'up' : ratio <= 0 ? 'down' : 'partial';
        // Never print 100% on a day that had downtime.
        const pct = ratio >= 1 ? 100 : Math.min(99, Math.round(ratio * 100));
        return { date, status, uptime: pct };
      });
      const cur = latest.get(key);
      return {
        key,
        name,
        currentStatus: cur && !stale ? (cur.up ? 'up' : 'down') : 'unknown',
        latencyMs: cur?.latencyMs ?? null,
        uptimePercent:
          totalMs > 0 ? Math.floor((upMs / totalMs) * 10000) / 100 : null,
        days,
      };
    });

    // Open incidents whenever they started, plus everything in the window.
    const incidentsSince = new Date();
    incidentsSince.setUTCDate(incidentsSince.getUTCDate() - (INCIDENT_DAYS - 1));
    incidentsSince.setUTCHours(0, 0, 0, 0);
    const incidents = await this.prisma.incident.findMany({
      where: {
        OR: [{ startedAt: { gte: incidentsSince } }, { resolvedAt: null }],
      },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });

    // Health says one thing, open incidents another: show the worse of the two.
    // A stale sampler is 'unknown', never green.
    const anyDown = services.some((s) => s.currentStatus === 'down');
    const allDown = services.every((s) => s.currentStatus === 'down');
    const fromHealth: OverallStatus = stale
      ? 'unknown'
      : allDown
        ? 'major_outage'
        : anyDown
          ? 'degraded'
          : 'operational';
    const overall = worst(
      fromHealth,
      overallFromIncidents(incidents.filter((i) => !i.resolvedAt)),
    );

    return {
      overall,
      stale,
      updatedAt: new Date().toISOString(),
      lastSampleAt: lastSampleAt?.toISOString() ?? null,
      incidentDays: INCIDENT_DAYS,
      services,
      incidents,
    };
  }

  /* ------------------------------- incidents ------------------------------ */

  async listIncidents(limit = 20) {
    return this.prisma.incident.findMany({
      take: limit,
      orderBy: { startedAt: 'desc' },
    });
  }

  async createIncident(
    dto: {
      title: string;
      body?: string;
      impact?: IncidentImpact;
      status?: IncidentStatus;
      affectedServices?: string[];
    },
    userId: string,
  ) {
    return this.prisma.incident.create({
      data: {
        title: dto.title,
        body: dto.body ?? null,
        impact: dto.impact ?? IncidentImpact.MINOR,
        status: dto.status ?? IncidentStatus.INVESTIGATING,
        affectedServices: dto.affectedServices ?? [],
        createdBy: userId,
      },
    });
  }

  async updateIncident(
    id: string,
    dto: {
      title?: string;
      body?: string;
      impact?: IncidentImpact;
      status?: IncidentStatus;
      affectedServices?: string[];
    },
  ) {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('Incident not found');

    const resolving =
      dto.status === IncidentStatus.RESOLVED && !incident.resolvedAt;

    return this.prisma.incident.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.impact !== undefined ? { impact: dto.impact } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.affectedServices !== undefined
          ? { affectedServices: dto.affectedServices }
          : {}),
        resolvedAt: resolving
          ? new Date()
          : dto.status && dto.status !== IncidentStatus.RESOLVED
            ? null
            : incident.resolvedAt,
      },
    });
  }

  /** Keep ~HISTORY_DAYS of samples. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanupCron(): Promise<void> {
    await this.redis.runExclusive('cron:healthCleanup', 60 * 60, () => this.cleanup());
  }

  async cleanup(): Promise<void> {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - (HISTORY_DAYS + 1));
    const { count } = await this.prisma.healthCheck.deleteMany({
      where: { checkedAt: { lt: cutoff } },
    });
    if (count > 0) this.logger.log(`Pruned ${count} old health checks`);
  }
}
