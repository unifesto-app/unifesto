import { Injectable } from '@nestjs/common';
import { EventStatus, SupportTicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { COUNTS_AS_ATTENDING } from '../common/attendance';
import { lastDays, startOfIstDay } from '../traffic/traffic.service';
import { SupportService } from '../support/support.service';
import { AdminService } from './admin.service';

/** This week vs the week before. */
export type WoW = { current: number; previous: number };
export type WoWRow = WoW & { key: string | null };

const DAY_MS = 86_400_000;

/** Join this week's and last week's grouped counts into one list, top `limit` by this week. */
export function mergeWeeks(
  current: { key: string | null; n: number }[],
  previous: { key: string | null; n: number }[],
  limit = 10,
): WoWRow[] {
  const rows = new Map<string | null, WoWRow>();
  const row = (key: string | null) => rows.get(key) ?? rows.set(key, { key, current: 0, previous: 0 }).get(key)!;
  for (const r of current) row(r.key).current += r.n;
  for (const r of previous) row(r.key).previous += r.n;
  return [...rows.values()]
    .sort((a, b) => b.current - a.current || b.previous - a.previous)
    .slice(0, limit);
}

/** A 14-day daily series (oldest first) summed into the last 7 days vs the 7 before. */
export function splitWeeks<T>(days: T[], pick: (d: T) => number): WoW {
  const sum = (xs: T[]) => Math.round(xs.reduce((s, d) => s + pick(d), 0) * 100) / 100;
  return { previous: sum(days.slice(0, -7)), current: sum(days.slice(-7)) };
}

/**
 * Z7 weekly scorecard for Apex: the last 7 IST days (today included) against
 * the 7 before. Money and support numbers come from their own services so the
 * scorecard can never disagree with the Financials or Support pages.
 *
 * ponytail: no demo-space exclusion yet; add it once common/demo-data.ts lands on main.
 */
@Injectable()
export class ScorecardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: AdminService,
    private readonly support: SupportService,
  ) {}

  async weekly(userId: string, now = new Date()) {
    const keys = lastDays(14, now);
    const prevStart = startOfIstDay(keys[0]);
    const curStart = startOfIstDay(keys[7]);
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

    const regsBySource = (gte: Date, lt: Date) =>
      this.prisma.eventRegistration
        .groupBy({
          by: ['utmSource'],
          where: { ...COUNTS_AS_ATTENDING, registeredAt: { gte, lt } },
          _count: { _all: true },
        })
        .then((gs) => gs.map((g) => ({ key: g.utmSource, n: g._count._all })));

    // Published and still ahead at instant `t` (events published before
    // publishedAt existed count throughout).
    const upcomingAt = (t: Date) =>
      this.prisma.event.count({
        where: {
          status: EventStatus.PUBLISHED,
          deletedAt: null,
          startDateTime: { gt: t },
          OR: [{ publishedAt: null }, { publishedAt: { lte: t } }],
        },
      });

    // Spaces that published an event in the 30 days up to `t`.
    const activeOrganisersAt = (t: Date) =>
      this.prisma.event
        .findMany({
          where: { deletedAt: null, publishedAt: { gt: new Date(t.getTime() - 30 * DAY_MS), lte: t } },
          distinct: ['spaceId'],
          select: { spaceId: true },
        })
        .then((rows) => rows.length);

    const [
      visits,
      referrers,
      campaigns,
      regsCur,
      regsPrev,
      upcomingNow,
      upcomingBefore,
      activeNow,
      activeBefore,
      money,
      supportStats,
      oldestOpen,
    ] = await Promise.all([
      this.prisma.$queryRaw<{ views_cur: number; views_prev: number; visits_cur: number; visits_prev: number }[]>`
        SELECT count(*) FILTER (WHERE created_at >= ${curStart})::int AS views_cur,
               count(*) FILTER (WHERE created_at < ${curStart})::int AS views_prev,
               count(DISTINCT visitor_id) FILTER (WHERE created_at >= ${curStart})::int AS visits_cur,
               count(DISTINCT visitor_id) FILTER (WHERE created_at < ${curStart})::int AS visits_prev
        FROM page_views WHERE target = 'PAGE' AND created_at >= ${prevStart}`,
      this.prisma.$queryRaw<WoWRow[]>`
        SELECT referrer_domain AS key,
               count(*) FILTER (WHERE created_at >= ${curStart})::int AS current,
               count(*) FILTER (WHERE created_at < ${curStart})::int AS previous
        FROM page_views WHERE target = 'PAGE' AND created_at >= ${prevStart}
        GROUP BY 1 ORDER BY 2 DESC, 3 DESC LIMIT 10`,
      this.prisma.$queryRaw<WoWRow[]>`
        SELECT campaign AS key,
               count(*) FILTER (WHERE created_at >= ${curStart})::int AS current,
               count(*) FILTER (WHERE created_at < ${curStart})::int AS previous
        FROM page_views WHERE target = 'PAGE' AND campaign IS NOT NULL AND created_at >= ${prevStart}
        GROUP BY 1 ORDER BY 2 DESC, 3 DESC LIMIT 10`,
      regsBySource(curStart, now),
      regsBySource(prevStart, curStart),
      upcomingAt(now),
      upcomingAt(weekAgo),
      activeOrganisersAt(now),
      activeOrganisersAt(weekAgo),
      // Same IST day buckets as above (keys), so the weeks line up.
      this.admin.getFinancialTimeseries('14d'),
      this.support.getStats(userId),
      this.prisma.supportTicket.findFirst({
        where: { status: SupportTicketStatus.OPEN },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);

    const v = visits[0];
    const registrations = mergeWeeks(regsCur, regsPrev);
    return {
      generatedAt: now.toISOString(),
      weeks: {
        current: { from: curStart.toISOString(), to: now.toISOString() },
        previous: { from: prevStart.toISOString(), to: curStart.toISOString() },
      },
      web: {
        pageViews: { current: v?.views_cur ?? 0, previous: v?.views_prev ?? 0 },
        // One device on one IST day (the visitor hash rotates daily).
        visits: { current: v?.visits_cur ?? 0, previous: v?.visits_prev ?? 0 },
        referrers,
        campaigns,
      },
      upcomingEvents: { current: upcomingNow, previous: upcomingBefore },
      activeOrganisers: { current: activeNow, previous: activeBefore },
      registrations: {
        total: {
          current: regsCur.reduce((s, r) => s + r.n, 0),
          previous: regsPrev.reduce((s, r) => s + r.n, 0),
        },
        bySource: registrations,
      },
      money: {
        // Ticket money in (incl. the app fee), by sale date; the Analytics series.
        gmv: splitWeeks(money.months, (d) => d.collected),
        // The app processing fee the platform keeps. Revenue-share cuts are only
        // computed cumulatively (Financials), so they are not in this weekly figure.
        platformFees: splitWeeks(money.months, (d) => d.processingFees),
      },
      support: {
        open: supportStats.open,
        pending: supportStats.pending,
        oldestOpenDays: oldestOpen ? Math.floor((now.getTime() - oldestOpen.createdAt.getTime()) / DAY_MS) : null,
      },
    };
  }
}
