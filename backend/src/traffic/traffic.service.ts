import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PageTarget, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { COUNTS_AS_ATTENDING } from '../common/attendance';
import { NOT_DELETED } from '../common/soft-delete';
import { CreateShortLinkDto, TrackViewDto } from './dto';

const WEB_URL = () => (process.env.WEB_URL || 'https://www.unifesto.app').replace(/\/$/, '');
/**
 * Host the short links live on. The API serves the redirect itself (GET /l/:code),
 * so links work with no website change; point SHORT_LINK_URL at a shorter
 * domain (e.g. go.unifesto.app → the API) later without touching code.
 */
const SHORT_BASE = () =>
  (process.env.SHORT_LINK_URL || process.env.PUBLIC_API_URL || 'https://api.unifesto.app').replace(/\/$/, '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IST_OFFSET_MS = 330 * 60 * 1000;
const CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 7;
const MAX_DAYS = 180;

/** Lowercased + trimmed like registration utm columns, so the two join up. */
const clean = (v?: string | null): string | null => {
  const t = v?.trim().toLowerCase().slice(0, 100);
  return t ? t : null;
};

/** The IST calendar day of an instant, as YYYY-MM-DD. */
export function istDay(at: Date = new Date()): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Referring host only (no paths or queries), ignoring our own sites. */
function referrerHost(raw?: string): string | null {
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.replace(/^www\./, '').toLowerCase();
    if (!host || host === 'unifesto.app' || host.endsWith('.unifesto.app')) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

function randomCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

type SourceKey = { source: string | null; medium: string | null; campaign: string | null };
const sourceKey = (s: SourceKey) => `${s.source ?? ''}|${s.medium ?? ''}|${s.campaign ?? ''}`;

/**
 * Page views, short tracking links and the page analytics built on them
 * (4.0.5, items 5.3g–i). Registrations already carry utm tags; views and
 * short-link clicks are the new top of that funnel.
 */
@Injectable()
export class TrafficService {
  private readonly logger = new Logger(TrafficService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Views ─────────────────────────────────────────────────────────────────

  /**
   * Record a view. One row per visitor per page per IST day: a repeat view
   * bumps `hits`, and the first tagged view of the day keeps the credit
   * (a later untagged view never wipes it). Unknown or private pages are
   * ignored rather than rejected, so a tracking call never breaks a page.
   */
  async trackView(dto: TrackViewDto, userId?: string | null): Promise<{ ok: boolean }> {
    const byId = UUID_RE.test(dto.key);
    let targetId: string;
    let eventId: string | null = null;
    let spaceId: string | null;

    if (dto.target === 'EVENT') {
      const event = await this.prisma.event.findFirst({
        where: { ...(byId ? { id: dto.key } : { slug: dto.key }), ...NOT_DELETED },
        select: { id: true, spaceId: true },
      });
      if (!event) return { ok: false };
      targetId = eventId = event.id;
      spaceId = event.spaceId;
    } else {
      const space = await this.prisma.space.findFirst({
        where: byId ? { id: dto.key } : { slug: dto.key },
        select: { id: true },
      });
      if (!space) return { ok: false };
      targetId = spaceId = space.id;
    }

    const day = istDay();
    await this.prisma.$executeRaw`
      INSERT INTO page_views
        (target, event_id, space_id, target_id, visitor_id, user_id, platform,
         utm_source, utm_medium, utm_campaign, referrer, day, hits, updated_at)
      VALUES
        (${dto.target}::page_target, ${eventId}::uuid, ${spaceId}::uuid, ${targetId}::uuid,
         ${dto.visitorId}, ${userId ?? null}::uuid, ${dto.platform},
         ${clean(dto.utmSource)}, ${clean(dto.utmMedium)}, ${clean(dto.utmCampaign)},
         ${referrerHost(dto.referrer)}, ${day}::date, 1, now())
      ON CONFLICT (target, target_id, visitor_id, day) DO UPDATE SET
        hits = page_views.hits + 1,
        user_id = COALESCE(page_views.user_id, EXCLUDED.user_id),
        utm_source = COALESCE(page_views.utm_source, EXCLUDED.utm_source),
        utm_medium = CASE WHEN page_views.utm_source IS NULL THEN EXCLUDED.utm_medium ELSE page_views.utm_medium END,
        utm_campaign = CASE WHEN page_views.utm_source IS NULL THEN EXCLUDED.utm_campaign ELSE page_views.utm_campaign END,
        referrer = COALESCE(page_views.referrer, EXCLUDED.referrer),
        updated_at = now()
    `;
    return { ok: true };
  }

  // ── Short links ───────────────────────────────────────────────────────────

  private shortUrl(code: string) {
    return `${SHORT_BASE()}/l/${code}`;
  }

  private destination(
    link: { target: PageTarget; utmSource: string; utmMedium: string | null; utmCampaign: string | null },
    slug: string,
  ) {
    const q = new URLSearchParams({ utm_source: link.utmSource });
    if (link.utmMedium) q.set('utm_medium', link.utmMedium);
    if (link.utmCampaign) q.set('utm_campaign', link.utmCampaign);
    const path = link.target === PageTarget.EVENT ? 'event' : 'space';
    return `${WEB_URL()}/${path}/${slug}?${q.toString()}`;
  }

  private view(link: {
    id: string;
    code: string;
    target: PageTarget;
    label: string;
    utmSource: string;
    utmMedium: string | null;
    utmCampaign: string | null;
    clicks: number;
    lastClickedAt: Date | null;
    createdAt: Date;
    event?: { id: string; slug: string; title: string } | null;
    space?: { id: string; slug: string | null } | null;
  }) {
    const slug = link.target === PageTarget.EVENT ? link.event?.slug : link.space?.slug ?? link.space?.id;
    return {
      id: link.id,
      code: link.code,
      target: link.target,
      label: link.label,
      utmSource: link.utmSource,
      utmMedium: link.utmMedium,
      utmCampaign: link.utmCampaign,
      clicks: link.clicks,
      lastClickedAt: link.lastClickedAt,
      createdAt: link.createdAt,
      event: link.event ? { id: link.event.id, slug: link.event.slug, title: link.event.title } : null,
      shortUrl: this.shortUrl(link.code),
      destinationUrl: slug ? this.destination(link, slug) : null,
    };
  }

  private readonly linkInclude = {
    event: { select: { id: true, slug: true, title: true } },
    space: { select: { id: true, slug: true } },
  } as const;

  private async createLink(
    data: Omit<Prisma.ShortLinkUncheckedCreateInput, 'code'>,
  ) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const link = await this.prisma.shortLink.create({
          data: { ...data, code: randomCode() },
          include: this.linkInclude,
        });
        return this.view(link);
      } catch (e) {
        // Code collision: roll a new one.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
    }
    throw new Error('Could not allocate a short link code');
  }

  private linkFields(dto: CreateShortLinkDto) {
    return {
      label: dto.label.trim(),
      utmSource: clean(dto.utmSource) ?? 'link',
      utmMedium: clean(dto.utmMedium),
      utmCampaign: clean(dto.utmCampaign),
    };
  }

  async createEventLink(eventId: string, userId: string, dto: CreateShortLinkDto) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, spaceId: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    return this.createLink({
      target: PageTarget.EVENT,
      eventId: event.id,
      spaceId: event.spaceId,
      createdById: userId,
      ...this.linkFields(dto),
    });
  }

  async createSpaceLink(spaceId: string, userId: string, dto: CreateShortLinkDto) {
    const space = await this.prisma.space.findUnique({ where: { id: spaceId }, select: { id: true } });
    if (!space) throw new NotFoundException('Space not found');
    return this.createLink({
      target: PageTarget.SPACE,
      spaceId: space.id,
      createdById: userId,
      ...this.linkFields(dto),
    });
  }

  async listEventLinks(eventId: string) {
    const links = await this.prisma.shortLink.findMany({
      where: { eventId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: this.linkInclude,
    });
    return links.map((l) => this.view(l));
  }

  /** Every link in the space: the space page's own and each event's. */
  async listSpaceLinks(spaceId: string) {
    const links = await this.prisma.shortLink.findMany({
      where: { spaceId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: this.linkInclude,
    });
    return links.map((l) => this.view(l));
  }

  async deleteLink(scope: { eventId?: string; spaceId?: string }, linkId: string) {
    const res = await this.prisma.shortLink.updateMany({
      where: { id: linkId, deletedAt: null, ...scope },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('Link not found');
    return { success: true };
  }

  /**
   * Where a short link goes, counting the click. A deleted or unknown code
   * goes to the home page so a printed QR never dead-ends.
   */
  async resolve(code: string): Promise<{ url: string }> {
    const link = await this.prisma.shortLink.findUnique({
      where: { code },
      include: this.linkInclude,
    });
    if (!link || link.deletedAt) return { url: WEB_URL() };
    const slug = link.target === PageTarget.EVENT ? link.event?.slug : link.space?.slug ?? link.space?.id;
    if (!slug) return { url: WEB_URL() };
    await this.prisma.shortLink
      .update({ where: { id: link.id }, data: { clicks: { increment: 1 }, lastClickedAt: new Date() } })
      .catch((e) => this.logger.warn(`click count failed for ${code}: ${e?.message}`));
    return { url: this.destination(link, slug) };
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  private range(days?: number) {
    const n = Math.min(Math.max(Math.floor(days || 30), 1), MAX_DAYS);
    const to = istDay();
    const from = istDay(new Date(Date.now() - (n - 1) * 86_400_000));
    // Registrations are timestamps: IST midnight of `from` in UTC.
    const since = new Date(new Date(`${from}T00:00:00Z`).getTime() - IST_OFFSET_MS);
    return { days: n, from, to, since };
  }

  /** Every day in the range, oldest first, so charts have no gaps. */
  private dayList(from: string, days: number) {
    const start = new Date(`${from}T00:00:00Z`).getTime();
    return Array.from({ length: days }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
  }

  /** Views, visitors, sources and platforms for a page_views filter. */
  private async viewStats(where: Prisma.Sql, from: string) {
    const [daily, sources, platforms, referrers, totals] = await Promise.all([
      this.prisma.$queryRaw<{ day: Date; visitors: bigint; views: bigint }[]>`
        SELECT day, COUNT(*) AS visitors, SUM(hits) AS views
        FROM page_views WHERE ${where} AND day >= ${from}::date
        GROUP BY day`,
      this.prisma.$queryRaw<
        { source: string | null; medium: string | null; campaign: string | null; visitors: bigint; views: bigint }[]
      >`
        SELECT utm_source AS source, utm_medium AS medium, utm_campaign AS campaign,
               COUNT(*) AS visitors, SUM(hits) AS views
        FROM page_views WHERE ${where} AND day >= ${from}::date
        GROUP BY 1, 2, 3`,
      this.prisma.$queryRaw<{ platform: string; visitors: bigint }[]>`
        SELECT platform, COUNT(*) AS visitors
        FROM page_views WHERE ${where} AND day >= ${from}::date
        GROUP BY 1 ORDER BY 2 DESC`,
      this.prisma.$queryRaw<{ referrer: string; visitors: bigint }[]>`
        SELECT referrer, COUNT(*) AS visitors
        FROM page_views WHERE ${where} AND day >= ${from}::date AND referrer IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      this.prisma.$queryRaw<{ visitors: bigint; unique_visitors: bigint; views: bigint }[]>`
        SELECT COUNT(*) AS visitors, COUNT(DISTINCT visitor_id) AS unique_visitors,
               COALESCE(SUM(hits), 0) AS views
        FROM page_views WHERE ${where} AND day >= ${from}::date`,
    ]);
    return { daily, sources, platforms, referrers, totals: totals[0] };
  }

  /** Confirmed registrations per IST day and per utm tag, for a registration filter. */
  private async registrationStats(where: Prisma.EventRegistrationWhereInput, since: Date) {
    const regs = await this.prisma.eventRegistration.findMany({
      where: { ...where, ...COUNTS_AS_ATTENDING, registeredAt: { gte: since } },
      select: { registeredAt: true, utmSource: true, utmMedium: true, utmCampaign: true, eventId: true },
    });
    const byDay = new Map<string, number>();
    const bySource = new Map<string, number>();
    const byEvent = new Map<string, number>();
    for (const r of regs) {
      const d = istDay(r.registeredAt);
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
      const k = sourceKey({ source: r.utmSource, medium: r.utmMedium, campaign: r.utmCampaign });
      bySource.set(k, (bySource.get(k) ?? 0) + 1);
      byEvent.set(r.eventId, (byEvent.get(r.eventId) ?? 0) + 1);
    }
    return { total: regs.length, byDay, bySource, byEvent };
  }

  private assemble(
    range: { days: number; from: string; to: string },
    views: Awaited<ReturnType<TrafficService['viewStats']>>,
    regs: Awaited<ReturnType<TrafficService['registrationStats']>>,
  ) {
    const n = (v: bigint | number | null | undefined) => Number(v ?? 0);
    const viewDay = new Map(views.daily.map((d) => [istDay(new Date(d.day)), d]));

    // Sources: the union of tags seen on views and on registrations.
    const sources = new Map<string, SourceKey & { visitors: number; views: number; registrations: number }>();
    for (const s of views.sources) {
      sources.set(sourceKey(s), {
        source: s.source,
        medium: s.medium,
        campaign: s.campaign,
        visitors: n(s.visitors),
        views: n(s.views),
        registrations: 0,
      });
    }
    for (const [k, count] of regs.bySource) {
      const row = sources.get(k);
      if (row) row.registrations = count;
      else {
        const [source, medium, campaign] = k.split('|');
        sources.set(k, {
          source: source || null,
          medium: medium || null,
          campaign: campaign || null,
          visitors: 0,
          views: 0,
          registrations: count,
        });
      }
    }

    const visitors = n(views.totals?.visitors);
    return {
      range,
      totals: {
        views: n(views.totals?.views),
        /** Visitor-days: one per visitor per day. */
        visitors,
        uniqueVisitors: n(views.totals?.unique_visitors),
        registrations: regs.total,
        /** Registrations per 100 visitor-days, 1 decimal. */
        conversionRate: visitors ? Math.round((regs.total / visitors) * 1000) / 10 : null,
      },
      daily: this.dayList(range.from, range.days).map((day) => ({
        day,
        views: n(viewDay.get(day)?.views),
        visitors: n(viewDay.get(day)?.visitors),
        registrations: regs.byDay.get(day) ?? 0,
      })),
      sources: [...sources.values()].sort(
        (a, b) => b.visitors - a.visitors || b.registrations - a.registrations,
      ),
      platforms: views.platforms.map((p) => ({ platform: p.platform, visitors: n(p.visitors) })),
      referrers: views.referrers.map((r) => ({ referrer: r.referrer, visitors: n(r.visitors) })),
    };
  }

  async eventAnalytics(eventId: string, days?: number) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) throw new NotFoundException('Event not found');
    const range = this.range(days);
    const [views, regs, links] = await Promise.all([
      this.viewStats(Prisma.sql`target = 'EVENT' AND event_id = ${eventId}::uuid`, range.from),
      this.registrationStats({ eventId }, range.since),
      this.listEventLinks(eventId),
    ]);
    return { ...this.assemble(range, views, regs), shortLinks: links };
  }

  /**
   * The space page plus every event it hosts, with a per-event breakdown.
   * Totals count both kinds of page.
   */
  async spaceAnalytics(spaceId: string, days?: number) {
    const space = await this.prisma.space.findUnique({ where: { id: spaceId }, select: { id: true } });
    if (!space) throw new NotFoundException('Space not found');
    const range = this.range(days);
    const [views, regs, pageOnly, perEvent, links] = await Promise.all([
      this.viewStats(Prisma.sql`space_id = ${spaceId}::uuid`, range.from),
      this.registrationStats({ event: { spaceId } }, range.since),
      this.prisma.$queryRaw<{ visitors: bigint; views: bigint }[]>`
        SELECT COUNT(*) AS visitors, COALESCE(SUM(hits), 0) AS views
        FROM page_views WHERE target = 'SPACE' AND space_id = ${spaceId}::uuid AND day >= ${range.from}::date`,
      this.prisma.$queryRaw<{ event_id: string; visitors: bigint; views: bigint }[]>`
        SELECT event_id, COUNT(*) AS visitors, SUM(hits) AS views
        FROM page_views WHERE target = 'EVENT' AND space_id = ${spaceId}::uuid AND day >= ${range.from}::date
        GROUP BY 1`,
      this.listSpaceLinks(spaceId),
    ]);

    const eventIds = [...new Set([...perEvent.map((e) => e.event_id), ...regs.byEvent.keys()])];
    const events = eventIds.length
      ? await this.prisma.event.findMany({
          where: { id: { in: eventIds } },
          select: { id: true, title: true, slug: true, startDateTime: true },
        })
      : [];
    const viewsByEvent = new Map(perEvent.map((e) => [e.event_id, e]));
    const topEvents = events
      .map((e) => {
        const v = viewsByEvent.get(e.id);
        const visitors = Number(v?.visitors ?? 0);
        const registrations = regs.byEvent.get(e.id) ?? 0;
        return {
          id: e.id,
          title: e.title,
          slug: e.slug,
          startDateTime: e.startDateTime,
          visitors,
          views: Number(v?.views ?? 0),
          registrations,
          conversionRate: visitors ? Math.round((registrations / visitors) * 1000) / 10 : null,
        };
      })
      .sort((a, b) => b.visitors - a.visitors || b.registrations - a.registrations)
      .slice(0, 20);

    return {
      ...this.assemble(range, views, regs),
      spacePage: { visitors: Number(pageOnly[0]?.visitors ?? 0), views: Number(pageOnly[0]?.views ?? 0) },
      topEvents,
      shortLinks: links,
    };
  }
}
