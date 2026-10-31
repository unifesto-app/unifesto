import { Injectable } from '@nestjs/common';
import { Prisma, TrafficTarget } from '@prisma/client';
import { createHmac } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { COUNTS_AS_ATTENDING } from '../common/attendance';
import { RecordViewDto, RecordWebViewDto } from './dto';
import { hmacSecret } from '../common/secrets';

/** Repeat views of one page from one visitor inside this window count once. */
const VIEW_DEDUPE_MS = 30 * 60_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- Pure helpers (exported for tests) ----

/** Day key in IST (the platform's reporting timezone), e.g. "2026-09-25". */
export const istDay = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

/** The last `days` IST day keys, oldest first, ending today. */
export function lastDays(days: number, now = new Date()): string[] {
  const today = istDay(now);
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    keys.push(new Date(Date.parse(`${today}T00:00:00Z`) - i * 86_400_000).toISOString().slice(0, 10));
  }
  return keys;
}

/** Midnight IST at the start of the first day key. */
export const startOfIstDay = (key: string) => new Date(`${key}T00:00:00+05:30`);

/** One row per day key (zeros for days with nothing), in key order. */
export function fillDays<T extends { day: string }>(
  keys: string[],
  rows: T[],
  empty: Omit<T, 'day'>,
): T[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return keys.map((day) => byDay.get(day) ?? ({ ...empty, day } as T));
}

/** Link-preview fetchers and crawlers: never counted. */
const BOT_RE =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|twitter|linkedin|skype|embedly|curl|wget|python-requests|headless/i;

export const isBot = (ua: string | undefined) => !ua || BOT_RE.test(ua);

/** "https://l.instagram.com/?u=…" → "instagram.com"; null when absent or unparsable. */
export function referrerDomain(referer: string | undefined): string | null {
  if (!referer) return null;
  try {
    const host = new URL(referer).hostname.toLowerCase().replace(/^(www|m|l|lm)\./, '');
    return host ? host.slice(0, 255) : null;
  } catch {
    return null;
  }
}

/** referrerDomain, minus our own sites: moving between unifesto.app pages is not a referral. */
export function externalReferrerDomain(referer: string | undefined): string | null {
  const domain = referrerDomain(referer);
  return domain && domain !== 'unifesto.app' && !domain.endsWith('.unifesto.app') ? domain : null;
}

/** "/event/x?utm_source=a#top" → "/event/x"; null unless it is a site path. */
export function pagePath(path: string): string | null {
  const p = path.split(/[?#]/)[0].slice(0, 300);
  return p.startsWith('/') && !p.startsWith('//') ? p : null;
}

type Visitor = { ip?: string; ua?: string };

type Daily = { day: string; views: number; visitors: number };

/**
 * Traffic: page views of event and space pages (sent by the app on first load
 * of a detail screen) and of any website page. Where registrations came from
 * is event_registrations.utm_*, which the app and website fill from the link.
 */
@Injectable()
export class TrafficService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Page views ----

  /** Best-effort beacon: unknown pages and repeat views are ignored, never errors. */
  async recordView(dto: RecordViewDto): Promise<{ recorded: boolean }> {
    const byIdOrSlug = UUID_RE.test(dto.id) ? { OR: [{ id: dto.id }, { slug: dto.id }] } : { slug: dto.id };

    let eventId: string | null = null;
    let spaceId: string;
    if (dto.target === 'EVENT') {
      const event = await this.prisma.event.findFirst({
        where: { ...byIdOrSlug, deletedAt: null },
        select: { id: true, spaceId: true },
      });
      if (!event) return { recorded: false };
      eventId = event.id;
      spaceId = event.spaceId;
    } else {
      const space = await this.prisma.space.findFirst({ where: byIdOrSlug, select: { id: true } });
      if (!space) return { recorded: false };
      spaceId = space.id;
    }

    const recent = await this.prisma.pageView.findFirst({
      where: {
        visitorId: dto.visitorId,
        target: dto.target,
        ...(eventId ? { eventId } : { spaceId }),
        createdAt: { gte: new Date(Date.now() - VIEW_DEDUPE_MS) },
      },
      select: { id: true },
    });
    if (recent) return { recorded: false };

    await this.prisma.pageView.create({
      data: {
        target: dto.target,
        eventId,
        spaceId,
        visitorId: dto.visitorId,
        platform: dto.platform,
        source: dto.source?.trim() || null,
        medium: dto.medium?.trim() || null,
        campaign: dto.campaign?.trim() || null,
      },
    });
    return { recorded: true };
  }

  /**
   * Website page load (K6). No cookie or stored id: the visitor is an HMAC of
   * the IST day + IP + user agent, so it rotates daily and the IP is never
   * stored. Bots are dropped; repeat loads of one path within 30 min count once.
   */
  async recordWebView(dto: RecordWebViewDto, visitor: Visitor): Promise<{ recorded: boolean }> {
    const path = pagePath(dto.path);
    if (!path || isBot(visitor.ua)) return { recorded: false };

    const visitorId = createHmac('sha256', hmacSecret('TRAFFIC_HASH_SECRET', 'traffic'))
      .update(`${istDay(new Date())}|${visitor.ip ?? ''}|${visitor.ua ?? ''}`)
      .digest('hex');

    const recent = await this.prisma.pageView.findFirst({
      where: {
        target: TrafficTarget.PAGE,
        visitorId,
        path,
        createdAt: { gte: new Date(Date.now() - VIEW_DEDUPE_MS) },
      },
      select: { id: true },
    });
    if (recent) return { recorded: false };

    await this.prisma.pageView.create({
      data: {
        target: TrafficTarget.PAGE,
        visitorId,
        platform: 'web',
        path,
        referrerDomain: externalReferrerDomain(dto.referrer),
        source: dto.source?.trim() || null,
        medium: dto.medium?.trim() || null,
        campaign: dto.campaign?.trim() || null,
      },
    });
    return { recorded: true };
  }

  /** Views, visitors, daily series, platforms and sources for page_views matching `filter`. */
  private async viewStats(filter: Prisma.Sql, days: number) {
    const keys = lastDays(days);
    const since = startOfIstDay(keys[0]);
    const where = Prisma.sql`${filter} AND created_at >= ${since}`;

    const [totals, daily, platforms, sources] = await Promise.all([
      this.prisma.$queryRaw<{ views: number; visitors: number }[]>`
        SELECT count(*)::int AS views, count(DISTINCT visitor_id)::int AS visitors
        FROM page_views WHERE ${where}`,
      this.prisma.$queryRaw<Daily[]>`
        SELECT to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
               count(*)::int AS views, count(DISTINCT visitor_id)::int AS visitors
        FROM page_views WHERE ${where} GROUP BY 1`,
      this.prisma.$queryRaw<{ platform: string; views: number }[]>`
        SELECT platform, count(*)::int AS views
        FROM page_views WHERE ${where} GROUP BY 1 ORDER BY 2 DESC`,
      this.prisma.$queryRaw<{ source: string | null; medium: string | null; views: number }[]>`
        SELECT source, medium, count(*)::int AS views
        FROM page_views WHERE ${where} GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10`,
    ]);

    return {
      days,
      since,
      views: totals[0]?.views ?? 0,
      visitors: totals[0]?.visitors ?? 0,
      daily: fillDays(keys, daily, { views: 0, visitors: 0 }).map(({ day, ...rest }) => ({ date: day, ...rest })),
      platforms,
      sources,
    };
  }

  private async topEvents(filter: Prisma.Sql, since: Date, limit = 10) {
    const rows = await this.prisma.$queryRaw<{ id: string; views: number; visitors: number }[]>`
      SELECT event_id AS id, count(*)::int AS views, count(DISTINCT visitor_id)::int AS visitors
      FROM page_views WHERE ${filter} AND event_id IS NOT NULL AND created_at >= ${since}
      GROUP BY 1 ORDER BY 2 DESC LIMIT ${limit}`;
    const events = await this.prisma.event.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: { id: true, title: true, slug: true },
    });
    const byId = new Map(events.map((e) => [e.id, e]));
    return rows.filter((r) => byId.has(r.id)).map((r) => ({ ...byId.get(r.id)!, views: r.views, visitors: r.visitors }));
  }

  private registrationsSince(where: Prisma.EventRegistrationWhereInput, since: Date) {
    return this.prisma.eventRegistration.count({
      where: { ...where, ...COUNTS_AS_ATTENDING, registeredAt: { gte: since } },
    });
  }

  async eventTraffic(eventId: string, days = 30) {
    const stats = await this.viewStats(Prisma.sql`event_id = ${eventId}::uuid`, days);
    const registrations = await this.registrationsSince({ eventId }, stats.since);
    return { ...stats, registrations };
  }

  /** The space page plus every event it hosts. */
  async spaceTraffic(spaceId: string, days = 30) {
    const filter = Prisma.sql`space_id = ${spaceId}::uuid`;
    const stats = await this.viewStats(filter, days);
    const [pageViews, topEvents, registrations] = await Promise.all([
      this.prisma.pageView.count({ where: { spaceId, target: TrafficTarget.SPACE, createdAt: { gte: stats.since } } }),
      this.topEvents(filter, stats.since),
      this.registrationsSince({ event: { spaceId } }, stats.since),
    ]);
    return { ...stats, spacePageViews: pageViews, topEvents, registrations };
  }

  async platformTraffic(days = 30) {
    const stats = await this.viewStats(Prisma.sql`TRUE`, days);
    const [topEvents, spaceRows, registrations] = await Promise.all([
      this.topEvents(Prisma.sql`TRUE`, stats.since),
      this.prisma.$queryRaw<{ id: string; views: number; visitors: number }[]>`
        SELECT space_id AS id, count(*)::int AS views, count(DISTINCT visitor_id)::int AS visitors
        FROM page_views WHERE space_id IS NOT NULL AND created_at >= ${stats.since}
        GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
      this.registrationsSince({}, stats.since),
    ]);
    const spaces = await this.prisma.space.findMany({
      where: { id: { in: spaceRows.map((r) => r.id) } },
      select: { id: true, name: true, slug: true },
    });
    const byId = new Map(spaces.map((s) => [s.id, s]));
    const topSpaces = spaceRows
      .filter((r) => byId.has(r.id))
      .map((r) => ({ ...byId.get(r.id)!, views: r.views, visitors: r.visitors }));
    return { ...stats, topEvents, topSpaces, registrations };
  }
}
