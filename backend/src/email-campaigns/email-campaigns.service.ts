import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailCampaign,
  EmailCampaignStatus,
  EmailLogStatus,
  EmailTargetType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { emailOptedOutUserIds } from '../email/email-preferences';
import { CreateCampaignDto, SegmentFiltersDto } from './dto/campaign.dto';

/** A recipient resolved for a campaign, with the fields merge-vars need. */
interface Recipient {
  email: string;
  userId?: string;
  name?: string | null;
}

/**
 * Scope a campaign operation belongs to. `spaceId: null` ⇒ platform (apex);
 * a string ⇒ that space, which constrains both which target types are allowed
 * and which recipients can be resolved.
 */
export interface CampaignScope {
  spaceId: string | null;
}

/** Target types a space operator may use (a subset of the platform set). */
const SPACE_ALLOWED_TARGETS: ReadonlySet<EmailTargetType> = new Set([
  EmailTargetType.SPACE_MEMBERS,
  EmailTargetType.EVENT_REGISTRANTS,
  EmailTargetType.WAITLIST,
  EmailTargetType.SINGLE_USER,
]);

@Injectable()
export class EmailCampaignsService {
  private readonly logger = new Logger(EmailCampaignsService.name);
  private readonly BATCH_SIZE = 100; // SES batch limit
  private readonly baseUrl: string;
  private readonly trackingSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {
    // Public host that serves the tracking endpoints (must be reachable by
    // recipients' mail clients, so it is the API's public URL, not localhost).
    this.baseUrl = (
      this.configService.get<string>('PUBLIC_API_URL') ||
      this.configService.get<string>('NEXT_PUBLIC_BACKEND_URL') ||
      'https://api.unifesto.app'
    ).replace(/\/+$/, '');
    // Reuse JWT_SECRET when a dedicated tracking secret isn't set — signing only
    // needs a stable server-side secret, and JWT_SECRET is always present.
    this.trackingSecret =
      this.configService.get<string>('EMAIL_TRACKING_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'unifesto-email-tracking';
  }

  // ==========================================================================
  // CREATE
  // ==========================================================================

  /**
   * Compose a campaign (and send now, or leave SCHEDULED for the cron). The
   * controller supplies the scope; a space scope both stamps `spaceId` on the
   * row and restricts/normalises the target.
   */
  async createCampaign(
    scope: CampaignScope,
    actorId: string,
    dto: CreateCampaignDto,
  ): Promise<{ success: true; campaignId: string }> {
    const targetId = await this.resolveTarget(scope, dto);

    const campaign = await this.prisma.emailCampaign.create({
      data: {
        spaceId: scope.spaceId,
        subject: dto.subject,
        subjectB: dto.subjectB ?? null,
        abSplitPct: dto.subjectB ? (dto.abSplitPct ?? 50) : null,
        body: dto.body,
        templateId: dto.templateId ?? null,
        sentBy: actorId,
        targetType: dto.targetType,
        targetId,
        segmentFilters: dto.segmentFilters
          ? (dto.segmentFilters as unknown as Prisma.InputJsonValue)
          : undefined,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        status: dto.scheduledAt
          ? EmailCampaignStatus.SCHEDULED
          : EmailCampaignStatus.PENDING,
      },
    });

    if (!dto.scheduledAt) {
      // Fire-and-forget: don't block the request on the whole send. Errors are
      // caught inside processCampaign and recorded on the row.
      void this.processCampaign(campaign.id).catch((err) =>
        this.logger.error(`processCampaign(${campaign.id}) failed: ${err instanceof Error ? err.message : String(err)}`),
      );
    }

    return { success: true, campaignId: campaign.id };
  }

  /**
   * Validate the target against the scope and return the `targetId` to store.
   * For a space, SPACE_MEMBERS implicitly targets the scope's own space, and
   * EVENT_REGISTRANTS/WAITLIST/SINGLE_USER must reference resources inside it.
   */
  private async resolveTarget(
    scope: CampaignScope,
    dto: CreateCampaignDto,
  ): Promise<string | null> {
    if (scope.spaceId && !SPACE_ALLOWED_TARGETS.has(dto.targetType)) {
      throw new ForbiddenException(
        `A space cannot send to target ${dto.targetType}`,
      );
    }

    switch (dto.targetType) {
      case EmailTargetType.SPACE_MEMBERS: {
        const spaceId = scope.spaceId ?? dto.targetId;
        if (!spaceId) throw new BadRequestException('spaceId is required');
        const space = await this.prisma.space.findUnique({
          where: { id: spaceId },
          select: { id: true },
        });
        if (!space) throw new NotFoundException('Space not found');
        return spaceId;
      }
      case EmailTargetType.EVENT_REGISTRANTS:
      case EmailTargetType.WAITLIST: {
        if (!dto.targetId) throw new BadRequestException('eventId is required');
        const event = await this.prisma.event.findUnique({
          where: { id: dto.targetId },
          select: { id: true, spaceId: true },
        });
        if (!event) throw new NotFoundException('Event not found');
        if (scope.spaceId && event.spaceId !== scope.spaceId) {
          throw new ForbiddenException('Event does not belong to this space');
        }
        return dto.targetId;
      }
      case EmailTargetType.SINGLE_USER: {
        if (!dto.targetId) throw new BadRequestException('userId is required');
        if (scope.spaceId) {
          const membership = await this.prisma.userRole.findFirst({
            where: { userId: dto.targetId, spaceId: scope.spaceId },
            select: { id: true },
          });
          if (!membership) {
            throw new ForbiddenException('User is not a member of this space');
          }
        }
        return dto.targetId;
      }
      // Platform-only targets carry no id.
      case EmailTargetType.ALL_USERS:
      case EmailTargetType.ORGANISERS_ONLY:
      case EmailTargetType.SEGMENT:
        return null;
      default:
        throw new BadRequestException('Unsupported target type');
    }
  }

  // ==========================================================================
  // READ / CANCEL (scope-filtered)
  // ==========================================================================

  async listCampaigns(scope: CampaignScope, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where: Prisma.EmailCampaignWhereInput = { spaceId: scope.spaceId };

    const [campaigns, total] = await Promise.all([
      this.prisma.emailCampaign.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { logs: true } } },
      }),
      this.prisma.emailCampaign.count({ where }),
    ]);

    return {
      data: campaigns,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getCampaign(scope: CampaignScope, id: string) {
    const campaign = await this.prisma.emailCampaign.findUnique({
      where: { id },
      include: { logs: { orderBy: { sentAt: 'desc' }, take: 200 } },
    });
    if (!campaign || campaign.spaceId !== scope.spaceId) {
      throw new NotFoundException('Campaign not found');
    }
    return { ...campaign, stats: this.abStatsFromLogs(campaign.logs) };
  }

  async cancelCampaign(scope: CampaignScope, id: string) {
    const campaign = await this.prisma.emailCampaign.findUnique({
      where: { id },
    });
    if (!campaign || campaign.spaceId !== scope.spaceId) {
      throw new NotFoundException('Campaign not found');
    }
    if (campaign.status !== EmailCampaignStatus.SCHEDULED) {
      throw new BadRequestException('Only scheduled campaigns can be cancelled');
    }
    await this.prisma.emailCampaign.update({
      where: { id },
      data: { status: EmailCampaignStatus.CANCELLED },
    });
    return { success: true, message: 'Campaign cancelled' };
  }

  /** Called by the scheduler cron for any scope. */
  processScheduledCampaign(campaignId: string): Promise<void> {
    return this.processCampaign(campaignId);
  }

  // ==========================================================================
  // PROCESS + SEND
  // ==========================================================================

  private async processCampaign(campaignId: string): Promise<void> {
    try {
      // Atomically claim the campaign: only one caller can move it out of a
      // pre-send state into SENDING. This is the authoritative guard against
      // double-sending when several replicas' cron sweeps (or a send-now plus a
      // retry) reach the same row concurrently — a plain update() would let them
      // all pass. `count === 0` means someone else already claimed it.
      const claim = await this.prisma.emailCampaign.updateMany({
        where: {
          id: campaignId,
          status: {
            in: [EmailCampaignStatus.PENDING, EmailCampaignStatus.SCHEDULED],
          },
        },
        data: { status: EmailCampaignStatus.SENDING },
      });
      if (claim.count === 0) return;

      const campaign = await this.prisma.emailCampaign.findUnique({
        where: { id: campaignId },
      });
      if (!campaign) return;

      const resolved = await this.getRecipients(campaign);
      // Marketing mail: drop users who turned email off.
      const optedOut = await emailOptedOutUserIds(
        this.prisma,
        resolved.flatMap((r) => (r.userId ? [r.userId] : [])),
      );
      const recipients = resolved.filter(
        (r) => !r.userId || !optedOut.has(r.userId),
      );
      if (recipients.length === 0) {
        await this.prisma.emailCampaign.update({
          where: { id: campaignId },
          data: {
            status: EmailCampaignStatus.SENT,
            totalSent: 0,
            sentAt: new Date(),
          },
        });
        return;
      }

      const variants = this.assignVariants(
        recipients.length,
        campaign.subjectB ? (campaign.abSplitPct ?? 50) : null,
      );

      let totalSent = 0;
      let failedCount = 0;

      for (let i = 0; i < recipients.length; i += this.BATCH_SIZE) {
        const batch = recipients.slice(i, i + this.BATCH_SIZE);
        const batchVariants = variants.slice(i, i + this.BATCH_SIZE);
        const results = await this.sendBatch(campaign, batch, batchVariants);
        totalSent += results.sent;
        failedCount += results.failed;
        await new Promise((resolve) => setTimeout(resolve, 1000)); // rate limit
      }

      await this.prisma.emailCampaign.update({
        where: { id: campaignId },
        data: {
          status: EmailCampaignStatus.SENT,
          totalSent,
          failedCount,
          sentAt: new Date(),
        },
      });
      this.logger.log(
        `Campaign ${campaignId}: ${totalSent} sent, ${failedCount} failed`,
      );
    } catch (error) {
      this.logger.error(`Campaign ${campaignId} failed: ${error.message}`);
      await this.prisma.emailCampaign
        .update({
          where: { id: campaignId },
          data: { status: EmailCampaignStatus.FAILED },
        })
        .catch(() => undefined);
    }
  }

  private async sendBatch(
    campaign: EmailCampaign,
    batch: Recipient[],
    variants: Array<'A' | 'B'>,
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < batch.length; i++) {
      const recipient = batch[i];
      const variant = variants[i] ?? 'A';
      // Compute the log id up-front so tracking URLs can reference it before
      // the row exists; we then create the row with this explicit id.
      const logId = randomUUID();
      const subject =
        variant === 'B' && campaign.subjectB
          ? campaign.subjectB
          : campaign.subject;
      const html = this.buildTrackedHtml(campaign, recipient, logId);

      try {
        const result = await this.emailService.sendCustomCampaignEmail({
          to: recipient.email,
          subject: this.substituteVars(subject, recipient),
          html,
          campaignId: campaign.id,
        });

        const ok = !!result.messageId;
        if (ok) sent++;
        else failed++;

        await this.prisma.emailCampaignLog.create({
          data: {
            id: logId,
            campaignId: campaign.id,
            recipientEmail: recipient.email,
            userId: recipient.userId,
            variant: campaign.subjectB ? variant : null,
            status: ok ? EmailLogStatus.SENT : EmailLogStatus.FAILED,
            sesMessageId: result.messageId ?? undefined,
            errorMessage: ok ? undefined : (result.error ?? 'Unknown error'),
          },
        });
      } catch (error) {
        failed++;
        await this.prisma.emailCampaignLog.create({
          data: {
            id: logId,
            campaignId: campaign.id,
            recipientEmail: recipient.email,
            userId: recipient.userId,
            variant: campaign.subjectB ? variant : null,
            status: EmailLogStatus.FAILED,
            errorMessage: error.message,
          },
        });
      }
    }

    return { sent, failed };
  }

  // ==========================================================================
  // RECIPIENTS (space-scoped)
  // ==========================================================================

  private async getRecipients(campaign: EmailCampaign): Promise<Recipient[]> {
    switch (campaign.targetType) {
      case EmailTargetType.SINGLE_USER:
        return this.usersToRecipients(
          await this.prisma.user.findMany({
            where: { id: campaign.targetId ?? undefined },
            include: { identities: { select: { email: true, isPrimary: true } } },
          }),
        );

      case EmailTargetType.SPACE_MEMBERS: {
        const members = await this.prisma.userRole.findMany({
          where: { spaceId: campaign.targetId ?? undefined },
          distinct: ['userId'],
          include: {
            user: { include: { identities: { select: { email: true, isPrimary: true } } } },
          },
        });
        return this.usersToRecipients(members.map((m) => m.user));
      }

      case EmailTargetType.EVENT_REGISTRANTS: {
        const regs = await this.prisma.eventRegistration.findMany({
          where: {
            eventId: campaign.targetId ?? undefined,
            status: { in: ['REGISTERED', 'ATTENDED'] },
          },
          select: { userId: true },
        });
        return this.usersToRecipients(
          await this.prisma.user.findMany({
            where: { id: { in: regs.map((r) => r.userId) } },
            include: { identities: { select: { email: true, isPrimary: true } } },
          }),
        );
      }

      case EmailTargetType.WAITLIST: {
        const waiting = await this.prisma.eventRegistration.findMany({
          where: {
            eventId: campaign.targetId ?? undefined,
            waitlistStatus: { in: ['WAITING', 'OFFERED'] },
            status: { not: 'CANCELLED' },
          },
          select: { userId: true },
        });
        return this.usersToRecipients(
          await this.prisma.user.findMany({
            where: { id: { in: waiting.map((r) => r.userId) } },
            include: { identities: { select: { email: true, isPrimary: true } } },
          }),
        );
      }

      case EmailTargetType.ALL_USERS:
        return this.usersToRecipients(
          await this.prisma.user.findMany({
            include: { identities: { select: { email: true, isPrimary: true } } },
          }),
        );

      case EmailTargetType.ORGANISERS_ONLY:
        return this.usersToRecipients(
          await this.prisma.user.findMany({
            where: { createdSpaces: { some: {} } },
            include: { identities: { select: { email: true, isPrimary: true } } },
            distinct: ['id'],
          }),
        );

      case EmailTargetType.SEGMENT:
        return this.usersToRecipients(
          await this.prisma.user.findMany({
            where: this.buildSegmentWhere(
              campaign.segmentFilters as unknown as SegmentFiltersDto | null,
            ),
            include: { identities: { select: { email: true, isPrimary: true } } },
          }),
        );

      default:
        return [];
    }
  }

  private usersToRecipients(
    users: Array<{
      id: string;
      fullName: string | null;
      identities: { email: string | null; isPrimary: boolean }[];
    }>,
  ): Recipient[] {
    const out: Recipient[] = [];
    for (const u of users) {
      // Send to the user's PRIMARY email; fall back to any address on file only
      // when no identity is flagged primary. Mirrors certificates.service.ts.
      const email =
        u.identities.find((i) => i.isPrimary && i.email)?.email ??
        u.identities.find((i) => i.email)?.email;
      if (email) out.push({ email, userId: u.id, name: u.fullName });
    }
    return out;
  }

  /**
   * DECISION — segment builder. Translates the typed segment filters into a
   * Prisma `where`. The semantics here (AND across filters; whether plan matches
   * ANY membership) are a product decision — adjust freely. Unsupported/empty
   * filters simply impose no constraint.
   */
  private buildSegmentWhere(
    filters: SegmentFiltersDto | null,
  ): Prisma.UserWhereInput {
    if (!filters) return {};
    const where: Prisma.UserWhereInput = {};

    if (filters.joinedAfter || filters.joinedBefore) {
      where.createdAt = {};
      if (filters.joinedAfter)
        where.createdAt.gte = new Date(filters.joinedAfter);
      if (filters.joinedBefore)
        where.createdAt.lte = new Date(filters.joinedBefore);
    }
    if (filters.plan?.length) {
      where.roles = {
        some: { space: { plan: { in: filters.plan as never } } },
      };
    }
    if (filters.hasRegistrations) {
      where.registrations = { some: {} };
    }
    return where;
  }

  // ==========================================================================
  // A/B ASSIGNMENT + MERGE VARS + TRACKING HTML
  // ==========================================================================

  /**
   * DECISION — A/B split by RANDOM assignment. Exactly `splitPct`% of recipients
   * are put in variant A and the rest in B (so the two arms keep the intended
   * sizes for a fair comparison), then a Fisher–Yates shuffle randomises WHICH
   * recipients land in each arm — removing any correlation between variant and
   * the recipient order (e.g. signup cohort). `splitPct` null ⇒ everyone A.
   *
   * `rng` is injectable purely so tests can make the shuffle deterministic;
   * production always uses Math.random.
   */
  private assignVariants(
    count: number,
    splitPct: number | null,
    rng: () => number = Math.random,
  ): Array<'A' | 'B'> {
    if (splitPct == null) return Array<'A' | 'B'>(count).fill('A');
    const clamped = Math.max(0, Math.min(100, splitPct));
    const aCount = Math.round((count * clamped) / 100);
    const out: Array<'A' | 'B'> = Array.from({ length: count }, (_, i) =>
      i < aCount ? 'A' : 'B',
    );
    // Fisher–Yates shuffle in place.
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Replace {{firstName}}, {{name}}, {{email}} (whitespace-tolerant). */
  private substituteVars(text: string, r: Recipient): string {
    const name = r.name?.trim() || '';
    const firstName = name.split(/\s+/)[0] || 'there';
    const map: Record<string, string> = {
      firstName,
      name: name || 'there',
      email: r.email,
    };
    return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) =>
      key in map ? map[key] : whole,
    );
  }

  /** Build the final per-recipient HTML: merge vars, click-tracked links, an
   * open pixel, and (optionally) the branded shell. */
  private buildTrackedHtml(
    campaign: EmailCampaign,
    recipient: Recipient,
    logId: string,
  ): string {
    let content = this.substituteVars(campaign.body, recipient);
    content = this.rewriteLinks(content, logId);
    // `wrap` defaults on; only the explicit `false` sentinel skips branding.
    // (Campaigns store body only, so we re-wrap here rather than at compose.)
    const wrapped = this.emailService.wrapCampaignHtml(content);
    return this.injectOpenPixel(wrapped, logId);
  }

  private rewriteLinks(html: string, logId: string): string {
    // Rewrite absolute http(s) hrefs to signed click-tracking URLs. Anchors,
    // mailto:, and relative links are left untouched.
    return html.replace(
      /(<a\b[^>]*\bhref=)(["'])(https?:\/\/[^"']+)\2/gi,
      (_m, pre: string, quote: string, url: string) => {
        const tracked = `${this.baseUrl}/email/track/click/${logId}?u=${encodeURIComponent(
          url,
        )}&s=${this.sign(url)}`;
        return `${pre}${quote}${tracked}${quote}`;
      },
    );
  }

  private injectOpenPixel(html: string, logId: string): string {
    const pixel = `<img src="${this.baseUrl}/email/track/open/${logId}" width="1" height="1" alt="" style="display:none" />`;
    return html.includes('</body>')
      ? html.replace('</body>', `${pixel}</body>`)
      : html + pixel;
  }

  // ==========================================================================
  // TRACKING (called by the public controller)
  // ==========================================================================

  /** HMAC-sign a URL so the click endpoint can't be turned into an open redirect. */
  sign(url: string): string {
    return createHmac('sha256', this.trackingSecret)
      .update(url)
      .digest('base64url');
  }

  verify(url: string, signature: string): boolean {
    const expected = this.sign(url);
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Record an open. First open of a log also bumps the campaign's unique count. */
  async recordOpen(logId: string): Promise<void> {
    const log = await this.prisma.emailCampaignLog.findUnique({
      where: { id: logId },
      select: { id: true, openedAt: true, campaignId: true },
    });
    if (!log) return;
    const first = !log.openedAt;
    await this.prisma.emailCampaignLog.update({
      where: { id: logId },
      data: {
        openCount: { increment: 1 },
        openedAt: first ? new Date() : undefined,
      },
    });
    if (first) {
      await this.prisma.emailCampaign.update({
        where: { id: log.campaignId },
        data: { openCount: { increment: 1 } },
      });
    }
  }

  /**
   * Validate a signed click and record it. Returns the target URL to redirect
   * to, or null when the signature doesn't match (tampered / forged link).
   */
  async recordClick(
    logId: string,
    url: string,
    signature: string,
  ): Promise<string | null> {
    if (!url || !signature || !this.verify(url, signature)) return null;
    const log = await this.prisma.emailCampaignLog.findUnique({
      where: { id: logId },
      select: { id: true, firstClickedAt: true, campaignId: true },
    });
    if (!log) return url; // still redirect; just don't attribute
    const first = !log.firstClickedAt;
    await this.prisma.emailCampaignLog.update({
      where: { id: logId },
      data: {
        clickCount: { increment: 1 },
        firstClickedAt: first ? new Date() : undefined,
      },
    });
    if (first) {
      await this.prisma.emailCampaign.update({
        where: { id: log.campaignId },
        data: { clickCount: { increment: 1 } },
      });
    }
    return url;
  }

  // ==========================================================================
  // MISC
  // ==========================================================================

  /** Per-variant open/click tallies for the campaign-detail A/B panel. */
  private abStatsFromLogs(
    logs: Array<{
      variant: string | null;
      openedAt: Date | null;
      firstClickedAt: Date | null;
    }>,
  ) {
    const tally = (v: 'A' | 'B' | null) => {
      const rows = logs.filter((l) => (l.variant ?? null) === v);
      return {
        sent: rows.length,
        opens: rows.filter((l) => l.openedAt).length,
        clicks: rows.filter((l) => l.firstClickedAt).length,
      };
    };
    const hasAb = logs.some((l) => l.variant);
    return hasAb ? { a: tally('A'), b: tally('B') } : null;
  }

  /** Render a body against sample merge values for the composer preview. */
  renderPreview(body: string): string {
    const sample: Recipient = {
      email: 'sample@unifesto.app',
      name: 'Alex Sample',
    };
    const content = this.substituteVars(body, sample);
    return this.emailService.wrapCampaignHtml(content);
  }
}
