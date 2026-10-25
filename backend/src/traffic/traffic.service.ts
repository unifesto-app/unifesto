import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, TrafficTarget } from '@prisma/client';
import { createHmac, randomInt } from 'crypto';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { COUNTS_AS_ATTENDING } from '../common/attendance';
import { CreateAdminShortLinkDto, CreateShortLinkDto, RecordViewDto, RecordWebViewDto } from './dto';
import { hmacSecret } from '../common/secrets';

/** utm_medium every short link destination carries; utm_campaign is the code. */
export const SHORT_LINK_MEDIUM = 'short_link';

/** Repeat views of one page from one visitor inside this window count once. */
const VIEW_DEDUPE_MS = 30 * 60_000;

const WEB_URL = () => (process.env.WEB_URL || 'https://www.unifesto.app').replace(/\/$/, '');
// unifesto.app/l/* is proxied straight to the backend by Caddy (K5).
const SHORT_BASE = () => (process.env.SHORT_LINK_BASE_URL || 'https://unifesto.app').replace(/\/$/, '');

export const shortUrl = (code: string) => `${SHORT_BASE()}/l/${code}`;
export const qrUrl = (code: string) => `${shortUrl(code)}/qr`;

const CODE_RE = /^[A-Za-z0-9]{4,16}$/;

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

// No 0/O/1/l/I: codes get read off posters and typed by hand.
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateCode(length = 7): string {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Link-preview fetchers and crawlers: redirected, never counted. */
const BOT_RE =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|twitter|linkedin|skype|embedly|curl|wget|python-requests|headless/i;

export const isBot = (ua: string | undefined) => !ua || BOT_RE.test(ua);

export function deviceOf(ua: string | undefined): 'ios' | 'android' | 'desktop' {
  if (!ua) return 'desktop';
  if (/iphone|ipad|ipod|ios/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

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

/** Cloudflare's Cf-Ipcountry → "IN"; null for unknown (XX), Tor (T1) or junk. */
export function countryOf(header: string | undefined): string | null {
  const c = header?.trim().toUpperCase();
  return c && /^[A-Z]{2}$/.test(c) && c !== 'XX' && c !== 'T1' ? c : null;
}

/** Only our own pages can be short-link destinations (no open redirect). */
export function isAllowedDestination(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return u.protocol === 'https:' && (host === 'unifesto.app' || host.endsWith('.unifesto.app'));
  } catch {
    return false;
  }
}

/** Destination with the short link's utm tags set (replacing any already there). */
export function withShortLinkTags(url: string, source: string, code: string): string {
  const u = new URL(url);
  u.searchParams.set('utm_source', source);
  u.searchParams.set('utm_medium', SHORT_LINK_MEDIUM);
  u.searchParams.set('utm_campaign', code);
  return u.toString();
}

/** "Instagram Bio!" → "instagram-bio": the link's utm_source. */
export function sourceSlug(name: string | undefined): string {
  const slug = (name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'link';
}

type Visitor = { ip?: string; ua?: string; referer?: string; country?: string };

type Daily = { day: string; views: number; visitors: number };

const shortLinkInclude = {
  event: { select: { id: true, title: true, slug: true } },
  space: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ShortLinkInclude;

type ShortLinkRow = Prisma.ShortLinkGetPayload<{ include: typeof shortLinkInclude }>;

/**
 * Traffic: page views of event and space pages (sent by the app on first load
 * of a detail screen) and tracked short links (`/l/<code>`). Registrations a
 * short link brings in are counted from event_registrations.utm_*, which the
 * app and website already fill from the link's tags.
 */
@Injectable()
export class TrafficService {
  private readonly logger = new Logger(TrafficService.name);

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

  // ---- Short links: create ----

  async createForEvent(eventId: string, createdById: string, dto: CreateShortLinkDto) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { id: true, slug: true, spaceId: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    return this.insert({
      target: TrafficTarget.EVENT,
      eventId: event.id,
      spaceId: event.spaceId,
      destination: `${WEB_URL()}/event/${event.slug}`,
      createdById,
      dto,
    });
  }

  async createForSpace(spaceId: string, createdById: string, dto: CreateShortLinkDto & { eventId?: string }) {
    if (dto.eventId) {
      const event = await this.prisma.event.findFirst({
        where: { id: dto.eventId, spaceId, deletedAt: null },
        select: { id: true },
      });
      if (!event) throw new NotFoundException('Event not found in this space');
      return this.createForEvent(event.id, createdById, dto);
    }
    const space = await this.prisma.space.findUnique({ where: { id: spaceId }, select: { id: true, slug: true } });
    if (!space) throw new NotFoundException('Space not found');
    return this.insert({
      target: TrafficTarget.SPACE,
      spaceId: space.id,
      destination: `${WEB_URL()}/space/${space.slug}`,
      createdById,
      dto,
    });
  }

  async createAdmin(createdById: string, dto: CreateAdminShortLinkDto) {
    const given = [dto.eventId, dto.spaceId, dto.url].filter(Boolean).length;
    if (given !== 1) throw new BadRequestException('Give exactly one of eventId, spaceId or url');
    if (dto.eventId) return this.createForEvent(dto.eventId, createdById, dto);
    if (dto.spaceId) return this.createForSpace(dto.spaceId, createdById, { title: dto.title, source: dto.source });
    const url = dto.url!.trim();
    if (!isAllowedDestination(url)) {
      throw new BadRequestException('Short links can only point to https pages on unifesto.app');
    }
    return this.insert({ target: TrafficTarget.URL, destination: url, createdById, dto });
  }

  private async insert(args: {
    target: TrafficTarget;
    eventId?: string;
    spaceId?: string;
    destination: string;
    createdById: string;
    dto: CreateShortLinkDto;
  }) {
    const source = sourceSlug(args.dto.source);
    // 55^7 codes: a clash is vanishingly rare, but retry rather than fail on one.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      try {
        const link = await this.prisma.shortLink.create({
          data: {
            code,
            target: args.target,
            eventId: args.eventId ?? null,
            spaceId: args.spaceId ?? null,
            url: withShortLinkTags(args.destination, source, code),
            title: args.dto.title?.trim() || null,
            source,
            createdById: args.createdById,
          },
          include: shortLinkInclude,
        });
        return this.view(link, 0);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
        throw err;
      }
    }
    throw new Error('Could not generate a unique short link code');
  }

  // ---- Short links: read ----

  private view(link: ShortLinkRow, registrations: number) {
    return {
      id: link.id,
      code: link.code,
      shortUrl: shortUrl(link.code),
      qrUrl: qrUrl(link.code),
      url: link.url,
      title: link.title,
      source: link.source,
      target: link.target,
      event: link.event,
      space: link.space,
      clicks: link.clickCount,
      registrations,
      createdAt: link.createdAt,
    };
  }

  /** Confirmed registrations per short link code. */
  private async registrationsByCode(codes: string[]): Promise<Map<string, number>> {
    if (codes.length === 0) return new Map();
    const groups = await this.prisma.eventRegistration.groupBy({
      by: ['utmCampaign'],
      where: { utmMedium: SHORT_LINK_MEDIUM, utmCampaign: { in: codes }, ...COUNTS_AS_ATTENDING },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.utmCampaign ?? '', g._count._all]));
  }

  /** Active links matching `scope` (an event, a space, or everything), newest first. */
  async list(scope: Prisma.ShortLinkWhereInput) {
    const links = await this.prisma.shortLink.findMany({
      where: { ...scope, revokedAt: null },
      include: shortLinkInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const regs = await this.registrationsByCode(links.map((l) => l.code));
    return links.map((l) => this.view(l, regs.get(l.code) ?? 0));
  }

  /** One link's clicks over time, unique visitors, referrers, devices and countries. */
  async stats(linkId: string, scope: Prisma.ShortLinkWhereInput, days = 30) {
    const link = await this.prisma.shortLink.findFirst({
      where: { ...scope, id: linkId, revokedAt: null },
      include: shortLinkInclude,
    });
    if (!link) throw new NotFoundException('Short link not found');

    const keys = lastDays(days);
    const since = startOfIstDay(keys[0]);
    const [regs, uniques, daily, referrers, devices, countries] = await Promise.all([
      this.registrationsByCode([link.code]),
      this.prisma.$queryRaw<{ visitors: number }[]>`
        SELECT count(DISTINCT visitor_hash)::int AS visitors
        FROM short_link_clicks WHERE short_link_id = ${link.id}::uuid`,
      this.prisma.$queryRaw<{ day: string; clicks: number }[]>`
        SELECT to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day, count(*)::int AS clicks
        FROM short_link_clicks WHERE short_link_id = ${link.id}::uuid AND created_at >= ${since}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ domain: string | null; clicks: number }[]>`
        SELECT referrer_domain AS domain, count(*)::int AS clicks
        FROM short_link_clicks WHERE short_link_id = ${link.id}::uuid
        GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
      this.prisma.$queryRaw<{ device: string; clicks: number }[]>`
        SELECT device, count(*)::int AS clicks
        FROM short_link_clicks WHERE short_link_id = ${link.id}::uuid
        GROUP BY 1 ORDER BY 2 DESC`,
      this.prisma.$queryRaw<{ country: string | null; clicks: number }[]>`
        SELECT country, count(*)::int AS clicks
        FROM short_link_clicks WHERE short_link_id = ${link.id}::uuid
        GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
    ]);

    return {
      ...this.view(link, regs.get(link.code) ?? 0),
      visitors: uniques[0]?.visitors ?? 0,
      days,
      daily: fillDays(keys, daily, { clicks: 0 }).map(({ day, clicks }) => ({ date: day, clicks })),
      referrers,
      devices,
      countries,
    };
  }

  async revoke(linkId: string, scope: Prisma.ShortLinkWhereInput) {
    const res = await this.prisma.shortLink.updateMany({
      where: { ...scope, id: linkId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('Short link not found');
    return { success: true };
  }

  // ---- Short links: redirect ----

  /**
   * Where `/l/<code>` sends the visitor. Unknown or revoked codes go to the
   * website home. The click is recorded off the response path.
   */
  async resolve(code: string, visitor: Visitor): Promise<string> {
    const link = CODE_RE.test(code)
      ? await this.prisma.shortLink.findUnique({
          where: { code },
          select: {
            id: true,
            url: true,
            target: true,
            source: true,
            revokedAt: true,
            event: { select: { slug: true } },
            space: { select: { slug: true } },
          },
        })
      : null;
    if (!link || link.revokedAt) return WEB_URL();
    if (!isBot(visitor.ua)) {
      void this.recordClick(link.id, visitor).catch((err) =>
        this.logger.warn(`Short link click not recorded (${code}): ${err?.message ?? err}`),
      );
    }
    // Event and space links follow the target by id, so a slug change after the
    // poster was printed still lands on the right page (B16).
    const page =
      link.target === TrafficTarget.EVENT && link.event
        ? `${WEB_URL()}/event/${link.event.slug}`
        : link.target === TrafficTarget.SPACE && link.space
          ? `${WEB_URL()}/space/${link.space.slug}`
          : null;
    return page ? withShortLinkTags(page, link.source, code) : link.url;
  }

  /** QR code of an active link's short URL, for posters and slides. Null when unknown or revoked. */
  async qr(code: string, format: 'svg' | 'png'): Promise<string | Buffer | null> {
    const link = CODE_RE.test(code)
      ? await this.prisma.shortLink.findUnique({ where: { code }, select: { revokedAt: true } })
      : null;
    if (!link || link.revokedAt) return null;
    const opts = { margin: 2, color: { dark: '#000000', light: '#ffffff' } };
    return format === 'png'
      ? QRCode.toBuffer(shortUrl(code), { ...opts, type: 'png', width: 1024 })
      : QRCode.toString(shortUrl(code), { ...opts, type: 'svg' });
  }

  private async recordClick(shortLinkId: string, visitor: Visitor) {
    const visitorHash = createHmac('sha256', hmacSecret('TRAFFIC_HASH_SECRET', 'traffic'))
      .update(`${visitor.ip ?? ''}|${visitor.ua ?? ''}`)
      .digest('hex');
    await this.prisma.$transaction([
      this.prisma.shortLinkClick.create({
        data: {
          shortLinkId,
          visitorHash,
          referrerDomain: referrerDomain(visitor.referer),
          device: deviceOf(visitor.ua),
          country: countryOf(visitor.country),
        },
      }),
      this.prisma.shortLink.update({ where: { id: shortLinkId }, data: { clickCount: { increment: 1 } } }),
    ]);
  }
}
