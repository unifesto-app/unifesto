import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainKind, Prisma, SpaceDomain } from '@prisma/client';
import { randomBytes } from 'crypto';
import { Resolver } from 'dns/promises';
import { Resend } from 'resend';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PlanConfigService } from '../subscription/plan-config.service';
import { BRAND_FONTS, isSpaceBrandingLive } from './branding.util';
import {
  AdminApplyBrandingDto,
  CreateWhiteLabelRequestDto,
  ReviewWhiteLabelRequestDto,
  UpdateBrandingDto,
} from './dto';
import { OUTBOUND_TIMEOUT_MS } from '../common/http/outbound-timeouts';

/**
 * White-label, self-serve. A space whose plan includes `hasRemoveBranding`
 * edits its own theme in the Branding studio; there is no approval step.
 * Platform admins keep a kill switch (`brandingSuspendedAt`) and can still
 * apply branding directly. Callers are authorised by `@Can` on the controller.
 *
 * The old request → review flow is kept only so shipped mobile builds keep
 * working: `createRequest` now enables branding immediately.
 */
/** The parts of a Cloudflare custom hostname we read. */
interface CfCustomHostname {
  id: string;
  hostname: string;
  status: string;
  ssl?: { status?: string; validation_records?: { txt_name?: string; txt_value?: string }[] };
  ownership_verification?: { type: string; name: string; value: string };
}

/** Emitted by SpacesService.deleteSpace with the space's SpaceDomain rows. */
export const SPACE_DOMAINS_ORPHANED = 'white-label.domains.orphaned';

/** A domain never verified within this long is dropped, freeing the hostname. */
export const PENDING_CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Our own ownership proof for a web domain. A CNAME to us is not proof: one
 * left dangling after removal would let any space claim the host (H25).
 */
export const ownershipTxt = (hostname: string, token: string) => ({
  name: `_unifesto.${hostname}`,
  value: `unifesto-verify=${token}`,
});

/** Lower-case FQDN with at least one dot; no unifesto.app hosts. */
export function normaliseHostname(raw: string): string {
  const host = raw.trim().toLowerCase().replace(/\.$/, '');
  const fqdn = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
  if (!fqdn.test(host)) throw new BadRequestException('Enter a domain like mail.yourorg.com');
  if (host === 'unifesto.app' || host.endsWith('.unifesto.app')) {
    throw new BadRequestException('Use a domain your organisation owns');
  }
  return host;
}

/**
 * Resend refuses a new domain once the account's plan limit is hit (Free = 1,
 * used by notify.unifesto.app; H20). Say so plainly instead of passing the
 * provider's wording through. Other errors (bad name etc.) keep their message.
 */
export function emailDomainCreateError(error: { name?: string; message?: string } | null) {
  const msg = error?.message ?? '';
  if (/quota/.test(error?.name ?? '') || /limit|plan|upgrade|maximum|quota/i.test(msg)) {
    return new ForbiddenException(
      "Custom sending domains aren't available on Unifesto yet. Your emails still go out from Unifesto's address with your sender name. Contact support if you need this.",
    );
  }
  return new BadRequestException(msg || 'Could not add that domain');
}

@Injectable()
export class WhiteLabelService {
  private readonly logger = new Logger(WhiteLabelService.name);
  // Null without RESEND_API_KEY: email domains are then unavailable.
  private readonly resend: Resend | null;
  // Cloudflare for SaaS (custom web hostnames). Unset → web domains unavailable.
  private readonly cf: { zoneId: string; token: string; target: string } | null;
  // Short timeouts: a slow nameserver only delays "Check now", never a page.
  private readonly dns = new Resolver({ timeout: 3000, tries: 2 });

  constructor(
    private readonly prisma: PrismaService,
    private readonly planConfig: PlanConfigService,
    private readonly cache: CacheService,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    const key = config.get<string>('RESEND_API_KEY');
    this.resend = key ? new Resend(key) : null;
    const zoneId = config.get<string>('CLOUDFLARE_ZONE_ID');
    const token = config.get<string>('CLOUDFLARE_API_TOKEN');
    this.cf =
      zoneId && token
        ? { zoneId, token, target: config.get<string>('CUSTOM_DOMAIN_TARGET', 'domains.unifesto.app') }
        : null;
  }

  /**
   * Public event pages are cached by slug and carry `branding`. An event target
   * busts only itself; a space target busts every event under it, since events
   * inherit the space's theme.
   */
  private async invalidateBrandingCaches(target: {
    spaceId?: string;
    eventId?: string;
  }) {
    const events = await this.prisma.event.findMany({
      where: target.eventId ? { id: target.eventId } : { spaceId: target.spaceId },
      select: { slug: true },
    });
    await Promise.all(
      events.map((e) => this.cache.invalidateEventCache(e.slug)),
    );
  }

  /** True when the space's plan includes the white-label perk. */
  private async spaceHasBrandingPlan(spaceId: string): Promise<boolean> {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      select: { subscription: true },
    });
    // No subscription → not paying for the perk → not allowed.
    if (!space?.subscription) return false;
    return this.planConfig.getEffectiveLimits(space.subscription).hasRemoveBranding;
  }

  private async assertPlan(spaceId: string) {
    if (!(await this.spaceHasBrandingPlan(spaceId))) {
      throw new ForbiddenException(
        'White-label is not included in this space’s plan. Upgrade to use it.',
      );
    }
  }

  /**
   * Legacy entry point (shipped mobile builds). Turns branding on for the
   * target straight away and logs the row as APPROVED so the history reads
   * right.
   */
  async createRequest(userId: string, dto: CreateWhiteLabelRequestDto) {
    if (dto.eventId) {
      const event = await this.prisma.event.findUnique({
        where: { id: dto.eventId },
        select: { spaceId: true },
      });
      if (!event) throw new NotFoundException('Event not found');
      if (event.spaceId !== dto.spaceId) {
        throw new BadRequestException('That event does not belong to this space');
      }
    }
    await this.assertPlan(dto.spaceId);

    const target = dto.eventId ? { eventId: dto.eventId } : { spaceId: dto.spaceId };
    const data = { whiteLabelEnabled: true, brandColor: dto.brandColor };
    const [, row] = await this.prisma.$transaction([
      dto.eventId
        ? this.prisma.event.update({ where: { id: dto.eventId }, data })
        : this.prisma.space.update({ where: { id: dto.spaceId }, data }),
      this.prisma.whiteLabelRequest.create({
        data: {
          spaceId: dto.spaceId,
          eventId: dto.eventId ?? null,
          requestedBy: userId,
          brandColor: dto.brandColor,
          reason: dto.reason,
          status: 'APPROVED',
          reviewNote: 'Self-serve',
          reviewedAt: new Date(),
        },
        include: this.requestInclude(),
      }),
    ]);
    await this.invalidateBrandingCaches(target);
    return row;
  }

  /** Requests raised by this user (optionally scoped to one space). */
  async getMyRequests(userId: string, spaceId?: string) {
    return this.prisma.whiteLabelRequest.findMany({
      where: { requestedBy: userId, ...(spaceId ? { spaceId } : {}) },
      include: this.requestInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Everything the Branding studio needs: the space theme, whether it is live
   * right now (and why not), and each event's colour override.
   */
  async getSpaceOverview(spaceId: string) {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      select: this.spaceBrandingSelect(),
    });
    if (!space) throw new NotFoundException('Space not found');

    const [planHasBranding, events, requests] = await Promise.all([
      this.spaceHasBrandingPlan(spaceId),
      this.prisma.event.findMany({
        where: { spaceId, deletedAt: null },
        select: {
          ...this.brandingSelect(),
          title: true,
          slug: true,
          status: true,
          startDateTime: true,
        },
        orderBy: { startDateTime: 'desc' },
      }),
      // Kept for older mobile builds that read the request history.
      this.prisma.whiteLabelRequest.findMany({
        where: { spaceId },
        include: this.requestInclude(),
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return {
      planHasBranding,
      live: isSpaceBrandingLive(space, planHasBranding),
      space,
      events,
      requests,
      fonts: BRAND_FONTS,
    };
  }

  /** Admin inbox (legacy request history). */
  async getAllRequests(status?: string, page = 1, limit = 20) {
    const where = status ? { status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.whiteLabelRequest.findMany({
        where,
        include: this.requestInclude(true),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.whiteLabelRequest.count({ where }),
    ]);

    const planBySpace = new Map<string, boolean>();
    for (const spaceId of new Set(rows.map((r) => r.spaceId))) {
      planBySpace.set(spaceId, await this.spaceHasBrandingPlan(spaceId));
    }
    const requests = rows.map((r) => ({
      ...r,
      planHasBranding: planBySpace.get(r.spaceId) ?? false,
    }));

    return {
      requests,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Admin decision on a request left PENDING from before self-serve. Approving
   * applies the colour and turns branding on, like it always did.
   */
  async reviewRequest(
    requestId: string,
    adminId: string,
    dto: ReviewWhiteLabelRequestDto,
  ) {
    const req = await this.prisma.whiteLabelRequest.findUnique({
      where: { id: requestId },
    });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== 'PENDING') {
      throw new BadRequestException('This request has already been reviewed');
    }

    const review = {
      status: dto.status,
      reviewNote: dto.reviewNote ?? null,
      reviewedBy: adminId,
      reviewedAt: new Date(),
    };
    if (dto.status === 'REJECTED') {
      return this.prisma.whiteLabelRequest.update({
        where: { id: requestId },
        data: review,
        include: this.requestInclude(true),
      });
    }

    const data = { whiteLabelEnabled: true, brandColor: req.brandColor };
    const [, updated] = await this.prisma.$transaction([
      req.eventId
        ? this.prisma.event.update({ where: { id: req.eventId }, data })
        : this.prisma.space.update({ where: { id: req.spaceId }, data }),
      this.prisma.whiteLabelRequest.update({
        where: { id: requestId },
        data: review,
        include: this.requestInclude(true),
      }),
    ]);

    await this.invalidateBrandingCaches(
      req.eventId ? { eventId: req.eventId } : { spaceId: req.spaceId },
    );
    return updated;
  }

  /**
   * Curator edits the space theme, or an event's colour override. Needs the
   * plan perk. Editing while suspended is allowed; it just won't render.
   */
  async updateBranding(
    target: { spaceId?: string; eventId?: string },
    dto: UpdateBrandingDto,
  ) {
    if (target.eventId) {
      const event = await this.prisma.event.findUnique({
        where: { id: target.eventId },
        select: { spaceId: true },
      });
      if (!event) throw new NotFoundException('Event not found');
      await this.assertPlan(event.spaceId);
      // An event only overrides the colour: setting one turns the override
      // on, clearing it (null) falls back to the space theme.
      const data =
        dto.brandColor !== undefined
          ? { brandColor: dto.brandColor, whiteLabelEnabled: dto.brandColor !== null }
          : {};
      const updated = await this.prisma.event.update({
        where: { id: target.eventId },
        data,
        select: this.brandingSelect(),
      });
      await this.invalidateBrandingCaches(target);
      return updated;
    }

    if (!target.spaceId) throw new BadRequestException('No target specified');
    await this.assertPlan(target.spaceId);
    const updated = await this.prisma.space.update({
      where: { id: target.spaceId },
      data: this.spaceThemePatch(dto),
      select: this.spaceBrandingSelect(),
    });
    await this.invalidateBrandingCaches(target);
    return updated;
  }

  /**
   * Admin override: turn branding on/off on a space or event and optionally set
   * the colour. Doesn't block on the plan (an admin may grant ahead of one) but
   * returns `willRender` so the UI can warn.
   */
  async adminApplyBranding(
    target: { spaceId?: string; eventId?: string },
    dto: AdminApplyBrandingDto,
  ) {
    const data: { whiteLabelEnabled: boolean; brandColor?: string | null } = {
      whiteLabelEnabled: dto.enabled,
    };
    if (dto.brandColor !== undefined) data.brandColor = dto.brandColor;

    let owningSpaceId: string;
    let updated: { id: string; whiteLabelEnabled: boolean; brandColor: string | null };
    if (target.eventId) {
      const event = await this.prisma.event.findUnique({
        where: { id: target.eventId },
        select: { spaceId: true },
      });
      if (!event) throw new NotFoundException('Event not found');
      owningSpaceId = event.spaceId;
      updated = await this.prisma.event.update({
        where: { id: target.eventId },
        data,
        select: this.brandingSelect(),
      });
    } else {
      if (!target.spaceId) throw new BadRequestException('No target specified');
      owningSpaceId = target.spaceId;
      updated = await this.prisma.space.update({
        where: { id: target.spaceId },
        data,
        select: this.brandingSelect(),
      });
    }

    await this.invalidateBrandingCaches(target);
    const planHasBranding = await this.spaceHasBrandingPlan(owningSpaceId);
    return { ...updated, willRender: dto.enabled && planHasBranding, planHasBranding };
  }

  /** Uploads the brand wordmark or favicon and saves it on the space. */
  async uploadAsset(spaceId: string, kind: 'logo' | 'favicon', file: Express.Multer.File) {
    await this.assertPlan(spaceId);
    const url = await this.storage.uploadFile(file, 'space-branding/', spaceId);
    const updated = await this.prisma.space.update({
      where: { id: spaceId },
      data: kind === 'logo' ? { brandLogoUrl: url } : { faviconUrl: url },
      select: this.spaceBrandingSelect(),
    });
    await this.invalidateBrandingCaches({ spaceId });
    return updated;
  }

  // ---------------------------------------------------------------------
  // Email sending domain (Resend). The space adds the DKIM/SPF records Resend
  // returns; once verified, attendee mail goes from <localPart>@<hostname>.
  // ---------------------------------------------------------------------

  private emailDomainProvider() {
    if (!this.resend) throw new BadRequestException('Email domains are not available right now');
    return this.resend.domains;
  }

  /** The space's domains. A pending one is re-checked at most once a minute. */
  async getDomains(spaceId: string) {
    const rows = await this.prisma.spaceDomain.findMany({ where: { spaceId } });
    const stale = (d: (typeof rows)[number]) =>
      d.status !== 'verified' &&
      d.providerId &&
      (!d.lastCheckedAt || Date.now() - d.lastCheckedAt.getTime() > 60_000);
    return Promise.all(
      rows.map((d) =>
        !stale(d) ? d : d.kind === DomainKind.EMAIL ? this.refreshEmailDomain(d.id) : this.refreshWebDomain(d.id),
      ),
    );
  }

  async addEmailDomain(spaceId: string, rawHost: string, localPart = 'tickets') {
    await this.assertPlan(spaceId);
    const hostname = normaliseHostname(rawHost);
    if (await this.prisma.spaceDomain.findFirst({ where: { spaceId, kind: DomainKind.EMAIL } })) {
      throw new ConflictException('This space already has an email domain. Remove it first.');
    }
    if (await this.prisma.spaceDomain.findUnique({ where: { hostname } })) {
      throw new ConflictException('That domain is already in use');
    }
    const { data, error } = await this.emailDomainProvider().create({ name: hostname });
    if (error || !data) {
      if (error) this.logger.warn(`Resend create ${hostname}: ${error.name} ${error.statusCode} ${error.message}`);
      throw emailDomainCreateError(error);
    }
    return this.prisma.spaceDomain.create({
      data: {
        spaceId,
        kind: DomainKind.EMAIL,
        hostname,
        emailLocalPart: localPart,
        providerId: data.id,
        status: data.status,
        records: data.records as unknown as Prisma.InputJsonValue,
        lastCheckedAt: new Date(),
      },
    });
  }

  /** Ask Resend to check the DNS now, then store what it reports. */
  async verifyEmailDomain(spaceId: string) {
    const row = await this.domainRow(spaceId, DomainKind.EMAIL);
    const { error } = await this.emailDomainProvider().verify(row.providerId!);
    if (error) throw new BadRequestException(error.message);
    return this.refreshEmailDomain(row.id);
  }

  async removeEmailDomain(spaceId: string) {
    const row = await this.domainRow(spaceId, DomainKind.EMAIL);
    await this.releaseProvider(row);
    await this.prisma.spaceDomain.delete({ where: { id: row.id } });
    return { removed: true };
  }

  /**
   * Best effort: delete the Resend domain / Cloudflare custom hostname behind
   * a row. The row must go even if the provider already forgot it, so this
   * only logs. Never throws.
   */
  private async releaseProvider(d: Pick<SpaceDomain, 'kind' | 'hostname' | 'providerId'>) {
    if (!d.providerId) return;
    try {
      if (d.kind === DomainKind.EMAIL) {
        if (!this.resend) throw new Error('RESEND_API_KEY not set');
        const { error } = await this.resend.domains.remove(d.providerId);
        if (error) throw new Error(error.message);
      } else {
        await this.cfApi('DELETE', `/${d.providerId}`);
      }
    } catch (e) {
      this.logger.warn(`Could not remove ${d.kind} domain ${d.hostname} upstream: ${(e as Error).message}`);
    }
  }

  /** A deleted space's rows are gone by cascade; clean their provider objects. */
  @OnEvent(SPACE_DOMAINS_ORPHANED, { async: true })
  async onDomainsOrphaned(domains: Pick<SpaceDomain, 'kind' | 'hostname' | 'providerId'>[]) {
    for (const d of domains) await this.releaseProvider(d);
  }

  /**
   * Cron (WhiteLabelSchedulerService). A claim never verified within
   * PENDING_CLAIM_TTL_MS is dropped so it can't squat the hostname. A verified
   * domain is re-read from its provider, so one whose DNS changed stops being
   * `verified` and mail falls back to Unifesto's sender, pages to 404.
   */
  async sweepDomains() {
    const rows = await this.prisma.spaceDomain.findMany();
    let expired = 0;
    let lapsed = 0;
    for (const d of rows) {
      if (!d.verifiedAt && d.status !== 'verified' && Date.now() - d.createdAt.getTime() > PENDING_CLAIM_TTL_MS) {
        await this.releaseProvider(d);
        await this.prisma.spaceDomain.delete({ where: { id: d.id } }).catch(() => undefined);
        expired++;
        continue;
      }
      if (d.status !== 'verified' || !d.providerId) continue;
      if (d.kind === DomainKind.EMAIL ? !this.resend : !this.cf) continue;
      const fresh = d.kind === DomainKind.EMAIL ? await this.refreshEmailDomain(d.id) : await this.refreshWebDomain(d.id);
      if (fresh.status !== 'verified') {
        lapsed++;
        this.logger.warn(`${d.kind} domain ${d.hostname} (space ${d.spaceId}) is no longer verified: ${fresh.status}`);
      }
    }
    return { checked: rows.length, expired, lapsed };
  }

  private async domainRow(spaceId: string, kind: DomainKind) {
    const row = await this.prisma.spaceDomain.findFirst({ where: { spaceId, kind } });
    if (!row?.providerId) throw new NotFoundException(`No ${kind.toLowerCase()} domain on this space`);
    return row;
  }

  private async refreshEmailDomain(id: string) {
    const row = await this.prisma.spaceDomain.findUniqueOrThrow({ where: { id } });
    const { data, error } = await this.emailDomainProvider().get(row.providerId!);
    if (error || !data) {
      this.logger.warn(`Resend get ${row.hostname}: ${error?.message}`);
      return this.prisma.spaceDomain.update({ where: { id }, data: { lastCheckedAt: new Date() } });
    }
    const verified = data.status === 'verified';
    return this.prisma.spaceDomain.update({
      where: { id },
      data: {
        status: data.status,
        records: data.records as unknown as Prisma.InputJsonValue,
        lastCheckedAt: new Date(),
        // First verification, kept if it lapses: tells a lost domain from a
        // never-proven claim (only the latter expires).
        ...(verified && !row.verifiedAt ? { verifiedAt: new Date() } : {}),
      },
    });
  }

  // ---------------------------------------------------------------------
  // Custom web domain (Cloudflare for SaaS custom hostnames). The space adds a
  // CNAME to our target plus Cloudflare's ownership TXT; Cloudflare issues the
  // certificate and forwards the host to our origin, where web resolves it.
  // ---------------------------------------------------------------------

  private async cfApi<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.cf) throw new BadRequestException('Custom domains are not available right now');
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${this.cf.zoneId}/custom_hostnames${path}`,
      {
        method,
        headers: { Authorization: `Bearer ${this.cf.token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      result?: T;
      errors?: { message: string }[];
    };
    if (!res.ok || !json.success) {
      throw new BadRequestException(json.errors?.[0]?.message ?? `Cloudflare error ${res.status}`);
    }
    return json.result as T;
  }

  /**
   * Our DB shape from a Cloudflare custom hostname. `owned` is our TXT check;
   * `token` null only for a domain verified before the TXT existed.
   */
  private webDomainState(h: CfCustomHostname, token: string | null, owned: boolean) {
    const routed = h.status === 'active' && h.ssl?.status === 'active';
    const verified = routed && owned;
    const ok = (done: boolean) => (done ? 'verified' : 'pending');
    const records = [
      ...(token ? [{ record: 'Ownership', type: 'TXT', ...ownershipTxt(h.hostname, token), status: ok(owned) }] : []),
      { record: 'Route', type: 'CNAME', name: h.hostname, value: this.cf!.target, status: ok(routed) },
      ...(h.ownership_verification && h.status !== 'active'
        ? [{ record: 'Cloudflare', type: 'TXT', name: h.ownership_verification.name, value: h.ownership_verification.value, status: 'pending' }]
        : []),
      ...(h.ssl?.validation_records ?? [])
        .filter((r) => r.txt_name && r.txt_value)
        .map((r) => ({ record: 'Certificate', type: 'TXT', name: r.txt_name!, value: r.txt_value!, status: ok(h.ssl?.status === 'active') })),
    ];
    return {
      status: verified ? 'verified' : h.status === 'blocked' || h.status === 'moved' ? 'failed' : 'pending',
      records: records as unknown as Prisma.InputJsonValue,
      lastCheckedAt: new Date(),
      verifyToken: token,
    };
  }

  /** True when `_unifesto.<host>` carries this token. Any DNS error is "not yet". */
  private async ownsHost(hostname: string, token: string): Promise<boolean> {
    const want = ownershipTxt(hostname, token);
    try {
      const rows = await this.dns.resolveTxt(want.name);
      return rows.some((parts) => parts.join('') === want.value);
    } catch {
      return false;
    }
  }

  async addWebDomain(spaceId: string, rawHost: string) {
    await this.assertPlan(spaceId);
    const hostname = normaliseHostname(rawHost);
    if (await this.prisma.spaceDomain.findFirst({ where: { spaceId, kind: DomainKind.WEB } })) {
      throw new ConflictException('This space already has a web domain. Remove it first.');
    }
    if (await this.prisma.spaceDomain.findUnique({ where: { hostname } })) {
      throw new ConflictException('That domain is already in use');
    }
    const h = await this.cfApi<CfCustomHostname>('POST', '', {
      hostname,
      ssl: { method: 'http', type: 'dv' },
    });
    const token = randomBytes(16).toString('hex');
    return this.prisma.spaceDomain.create({
      data: { spaceId, kind: DomainKind.WEB, hostname, providerId: h.id, ...this.webDomainState(h, token, false) },
    });
  }

  async verifyWebDomain(spaceId: string) {
    const row = await this.domainRow(spaceId, DomainKind.WEB);
    // Cloudflare re-checks on PATCH; an empty one just nudges it.
    await this.cfApi('PATCH', `/${row.providerId}`, { ssl: { method: 'http', type: 'dv' } });
    return this.refreshWebDomain(row.id);
  }

  async removeWebDomain(spaceId: string) {
    const row = await this.domainRow(spaceId, DomainKind.WEB);
    await this.releaseProvider(row);
    await this.prisma.spaceDomain.delete({ where: { id: row.id } });
    await this.invalidateBrandingCaches({ spaceId });
    return { removed: true };
  }

  private async refreshWebDomain(id: string) {
    const row = await this.prisma.spaceDomain.findUniqueOrThrow({ where: { id } });
    try {
      const h = await this.cfApi<CfCustomHostname>('GET', `/${row.providerId}`);
      // Proven once stays proven while verified; a domain from before the TXT
      // existed (no token) is grandfathered until it stops being verified.
      const token = row.verifyToken ?? (row.status === 'verified' ? null : randomBytes(16).toString('hex'));
      const owned = row.status === 'verified' || !token || (await this.ownsHost(row.hostname, token));
      const state = this.webDomainState(h, token, owned);
      const updated = await this.prisma.spaceDomain.update({
        where: { id },
        data: { ...state, ...(state.status === 'verified' && !row.verifiedAt ? { verifiedAt: new Date() } : {}) },
      });
      // Cached space/event payloads carry branding.customDomain.
      if (state.status !== row.status) await this.invalidateBrandingCaches({ spaceId: row.spaceId });
      return updated;
    } catch (e) {
      this.logger.warn(`Cloudflare get ${row.hostname}: ${(e as Error).message}`);
      return this.prisma.spaceDomain.update({ where: { id }, data: { lastCheckedAt: new Date() } });
    }
  }

  /**
   * Public: which space a custom hostname serves. Only a verified WEB domain
   * whose space branding is live resolves; anything else 404s, so a lapsed
   * plan or a suspension sends the domain back to nothing.
   */
  async resolveHost(rawHost: string): Promise<{ spaceSlug: string }> {
    const hostname = rawHost.trim().toLowerCase().replace(/:\d+$/, '');
    const row = await this.prisma.spaceDomain.findUnique({
      where: { hostname },
      select: {
        kind: true,
        status: true,
        space: { select: { slug: true, subscription: true, whiteLabelEnabled: true, brandingSuspendedAt: true } },
      },
    });
    const sub = row?.space.subscription;
    const live =
      row?.kind === DomainKind.WEB &&
      row.status === 'verified' &&
      !!sub &&
      isSpaceBrandingLive(row.space, this.planConfig.getEffectiveLimits(sub).hasRemoveBranding);
    if (!live) throw new NotFoundException('Unknown host');
    return { spaceSlug: row!.space.slug };
  }

  // origin -> allowed, kept a minute like web's host lookup (src/proxy.ts).
  // ponytail: per-process; wiped at 1000 entries so junk Origin headers can't grow it.
  private readonly corsOrigins = new Map<string, { ok: boolean; until: number }>();

  /**
   * CORS: true only for `https://<host>` exactly, where the host is a custom
   * web domain `resolveHost` would serve (verified, branding live, not
   * suspended). A lookup error is refused but not cached.
   */
  async isCustomDomainOrigin(origin: string): Promise<boolean> {
    const hit = this.corsOrigins.get(origin);
    if (hit && hit.until > Date.now()) return hit.ok;
    let ok = false;
    const url = URL.canParse(origin) ? new URL(origin) : null;
    try {
      if (url?.protocol === 'https:' && !url.port && url.origin === origin) {
        await this.resolveHost(url.hostname);
        ok = true;
      }
    } catch (e) {
      if (!(e instanceof NotFoundException)) {
        this.logger.warn(`CORS origin lookup failed for ${origin}: ${(e as Error).message}`);
        return false;
      }
    }
    if (this.corsOrigins.size >= 1000) this.corsOrigins.clear();
    this.corsOrigins.set(origin, { ok, until: Date.now() + 60_000 });
    return ok;
  }

  /** Platform kill switch. The stored theme is untouched, so unsuspending restores it. */
  async setSuspended(spaceId: string, suspended: boolean) {
    const updated = await this.prisma.space.update({
      where: { id: spaceId },
      data: { brandingSuspendedAt: suspended ? new Date() : null },
      select: this.spaceBrandingSelect(),
    });
    await this.invalidateBrandingCaches({ spaceId });
    return updated;
  }

  /** Only the fields present in the DTO; `null` clears, `undefined` leaves alone. */
  private spaceThemePatch(dto: UpdateBrandingDto) {
    const keys = [
      'brandColor',
      'brandLogoUrl',
      'brandFont',
      'brandMode',
      'hidePoweredBy',
      'faviconUrl',
      'emailFromName',
      'emailReplyTo',
    ] as const;
    const patch: Record<string, unknown> = {};
    for (const k of keys) if (dto[k] !== undefined) patch[k] = dto[k];
    if (dto.enabled !== undefined) patch.whiteLabelEnabled = dto.enabled;
    return patch;
  }

  private brandingSelect() {
    return { id: true, whiteLabelEnabled: true, brandColor: true };
  }

  private spaceBrandingSelect() {
    return {
      ...this.brandingSelect(),
      name: true,
      slug: true,
      logoUrl: true,
      brandingSuspendedAt: true,
      brandLogoUrl: true,
      brandFont: true,
      brandMode: true,
      hidePoweredBy: true,
      faviconUrl: true,
      emailFromName: true,
      emailReplyTo: true,
    };
  }

  private requestInclude(withContact = false) {
    return {
      space: { select: { id: true, name: true, slug: true, logoUrl: true } },
      event: { select: { id: true, title: true, slug: true } },
      requester: {
        select: {
          id: true,
          fullName: true,
          username: true,
          ...(withContact ? { mobileNumber: true } : {}),
        },
      },
    };
  }
}
