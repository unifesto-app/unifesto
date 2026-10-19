import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { hmacSecret } from '../common/secrets';
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
  MarketingChannel,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { emailOptedOutUserIds } from '../email/email-preferences';
import { COUNTS_AS_ATTENDING } from '../common/attendance';
import {
  MARKETABLE_USER,
  marketingOptOuts,
  promotionsOptedInUserIds,
  recordMarketingOptOut,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from '../common/marketing-opt-out';
import {
  CampaignAudienceDto,
  CreateCampaignDto,
  SegmentFiltersDto,
  TestCampaignDto,
} from './dto/campaign.dto';
import { EmailCampaignQueue } from './email-campaigns.queue';
import { PLATFORM_STAFF_WHERE } from '../common/platform-staff';

/** A SENDING campaign with no progress for this long is treated as stranded. */
export const STALE_SENDING_MS = 15 * 60 * 1000;
/** Stranded longer than this, resuming would surprise people: mark FAILED. */
export const ABANDONED_SENDING_MS = 24 * 60 * 60 * 1000;

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

// Only what usersToRecipients reads: the whole recipient list sits in memory
// for the run (A/B split + checkpoint need it), so keep each row small (S54).
const RECIPIENT_SELECT = {
  id: true,
  fullName: true,
  identities: { select: { email: true, isPrimary: true } },
} as const;

@Injectable()
export class EmailCampaignsService {
  private readonly logger = new Logger(EmailCampaignsService.name);
  private readonly BATCH_SIZE = 100; // SES batch limit
  private readonly baseUrl: string;
  private readonly trackingSecret: string;
  private readonly legacyTrackingSecret: string | null;
  private readonly unsubscribeSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly queue: EmailCampaignQueue,
  ) {
    // Public host that serves the tracking endpoints (must be reachable by
    // recipients' mail clients, so it is the API's public URL, not localhost).
    this.baseUrl = (
      this.configService.get<string>('PUBLIC_API_URL') ||
      this.configService.get<string>('NEXT_PUBLIC_BACKEND_URL') ||
      'https://api.unifesto.app'
    ).replace(/\/+$/, '');
    const get = (k: string) => this.configService.get<string>(k);
    this.trackingSecret = hmacSecret('EMAIL_TRACKING_SECRET', 'email-tracking', get);
    // Links in emails already sent were signed with the raw JWT_SECRET; keep
    // accepting those during the transition (S31). Drop once old mail is stale.
    this.legacyTrackingSecret = get('JWT_SECRET') || null;
    this.unsubscribeSecret = hmacSecret('EMAIL_UNSUBSCRIBE_SECRET', 'email-unsubscribe', get);
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
      // Claim + queue only; the send runs on the campaign worker.
      await this.startCampaign(campaign.id);
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
    dto: Pick<CreateCampaignDto, 'targetType' | 'targetId'>,
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
      case EmailTargetType.STAFF:
        return null;
      default:
        throw new BadRequestException('Unsupported target type');
    }
  }

  // ==========================================================================
  // CONFIRM STEP: audience count + send-to-me test
  // ==========================================================================

  /**
   * How many people a campaign would mail right now: the same target checks,
   * recipient resolution and email opt-out filter as the send itself.
   */
  async countAudience(
    scope: CampaignScope,
    dto: CampaignAudienceDto,
  ): Promise<{ recipientCount: number }> {
    const targetId = await this.resolveTarget(scope, dto);
    const resolved = await this.getRecipients({
      targetType: dto.targetType,
      targetId,
      segmentFilters: (dto.segmentFilters ?? null) as Prisma.JsonValue,
    });
    const allowed = await this.withConsent(
      { spaceId: scope.spaceId, targetType: dto.targetType },
      resolved,
    );
    return { recipientCount: allowed.length };
  }

  /** Mail the draft to the sender's own address, merge vars filled with theirs. Untracked. */
  async sendTest(actorId: string, dto: TestCampaignDto): Promise<{ sentTo: string }> {
    const [me] = this.usersToRecipients(
      await this.prisma.user.findMany({
        where: { id: actorId },
        select: RECIPIENT_SELECT,
      }),
    );
    if (!me) {
      throw new BadRequestException('Your account has no email address to send a test to');
    }
    const result = await this.emailService.sendCustomCampaignEmail({
      to: me.email,
      subject: `[Test] ${this.substituteVars(dto.subject, me)}`,
      // '#' shows the operator the unsubscribe footer without a live link.
      html: this.emailService.wrapCampaignHtml(this.substituteVars(dto.body, me), '#'),
      campaignId: 'test',
    });
    if (!result.messageId) {
      throw new BadRequestException(result.error ?? 'The test email could not be sent');
    }
    return { sentTo: me.email };
  }

  // ==========================================================================
  // READ / CANCEL (scope-filtered)
  // ==========================================================================

  async listCampaigns(scope: CampaignScope, page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const term = search?.trim();
    const where: Prisma.EmailCampaignWhereInput = {
      spaceId: scope.spaceId,
      ...(term
        ? {
            OR: [
              { subject: { contains: term, mode: 'insensitive' } },
              { subjectB: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

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
    return this.startCampaign(campaignId);
  }

  // ==========================================================================
  // PROCESS + SEND
  // ==========================================================================

  /**
   * Atomically claim the campaign (PENDING/SCHEDULED → SENDING) and hand it
   * to the worker. Only one caller can win the claim, which is the guard
   * against double-sending when replicas' cron sweeps (or a send-now plus a
   * retry) reach the same row together.
   */
  private async startCampaign(campaignId: string): Promise<void> {
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
    await this.dispatch(campaignId);
  }

  /** Queue the send, or run it in the background when there is no queue. */
  private async dispatch(campaignId: string): Promise<void> {
    const queued = await this.queue.add(campaignId).catch((err) => {
      this.logger.warn(`Campaign ${campaignId}: queue unavailable (${err.message}), sending inline`);
      return false;
    });
    if (!queued) {
      void this.runCampaign(campaignId, { lastAttempt: true }).catch(() => undefined);
    }
  }

  /**
   * Re-dispatch SENDING campaigns that stopped making progress (the process
   * died mid-send); ones stuck for over a day are marked FAILED instead. `updatedAt` is the heartbeat: every batch bumps it. The
   * conditional update makes one replica the owner of each restart.
   */
  async sweepStaleCampaigns(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - STALE_SENDING_MS);
    await this.prisma.emailCampaign.updateMany({
      where: {
        status: EmailCampaignStatus.SENDING,
        updatedAt: { lt: new Date(now.getTime() - ABANDONED_SENDING_MS) },
      },
      data: { status: EmailCampaignStatus.FAILED },
    });
    const stale = await this.prisma.emailCampaign.findMany({
      where: { status: EmailCampaignStatus.SENDING, updatedAt: { lt: cutoff } },
      select: { id: true },
      take: 20,
    });
    let restarted = 0;
    for (const { id } of stale) {
      const owned = await this.prisma.emailCampaign.updateMany({
        where: { id, status: EmailCampaignStatus.SENDING, updatedAt: { lt: cutoff } },
        data: { updatedAt: now },
      });
      if (owned.count === 0) continue;
      this.logger.warn(`Campaign ${id} stalled in SENDING; resuming`);
      await this.dispatch(id);
      restarted++;
    }
    return restarted;
  }

  /**
   * Send a claimed (SENDING) campaign. Resumable: recipients that already have
   * a log row for this campaign were sent (or failed) in an earlier run and
   * are skipped, so a retry never mails anyone twice. Throws on failure so the
   * queue can retry; the last attempt marks the campaign FAILED.
   */
  async runCampaign(
    campaignId: string,
    opts: { lastAttempt: boolean },
  ): Promise<void> {
    try {
      const campaign = await this.prisma.emailCampaign.findUnique({
        where: { id: campaignId },
      });
      if (!campaign || campaign.status !== EmailCampaignStatus.SENDING) return;

      const allowed = await this.withConsent(campaign, await this.getRecipients(campaign));
      // Checkpoint: everyone with a log row has been handled already.
      const done = new Set(
        (
          await this.prisma.emailCampaignLog.findMany({
            where: { campaignId },
            select: { recipientEmail: true },
          })
        ).map((l) => l.recipientEmail),
      );
      const recipients = allowed.filter((r) => !done.has(r.email));

      const variants = this.assignVariants(
        recipients.length,
        campaign.subjectB ? (campaign.abSplitPct ?? 50) : null,
      );

      for (let i = 0; i < recipients.length; i += this.BATCH_SIZE) {
        const batch = recipients.slice(i, i + this.BATCH_SIZE);
        const batchVariants = variants.slice(i, i + this.BATCH_SIZE);
        const results = await this.sendBatch(campaign, batch, batchVariants);
        // Progress + heartbeat (bumps updatedAt) for the stale sweep.
        await this.prisma.emailCampaign.update({
          where: { id: campaignId },
          data: {
            totalSent: { increment: results.sent },
            failedCount: { increment: results.failed },
          },
        });
        await new Promise((resolve) => setTimeout(resolve, 1000)); // rate limit
      }

      // Final totals from the logs, so they stay right across resumed runs.
      const [totalSent, failedCount] = await Promise.all([
        this.prisma.emailCampaignLog.count({
          where: { campaignId, status: EmailLogStatus.SENT },
        }),
        this.prisma.emailCampaignLog.count({
          where: { campaignId, status: EmailLogStatus.FAILED },
        }),
      ]);
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
      if (!opts.lastAttempt) throw error;
      await this.prisma.emailCampaign
        .update({
          where: { id: campaignId },
          data: { status: EmailCampaignStatus.FAILED },
        })
        .catch(() => undefined);
      throw error;
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
      const unsubscribeUrl = this.unsubscribeUrl(recipient.email, campaign.spaceId);
      const html = this.buildTrackedHtml(campaign, recipient, logId, unsubscribeUrl);

      try {
        const result = await this.emailService.sendCustomCampaignEmail({
          to: recipient.email,
          subject: this.substituteVars(subject, recipient),
          html,
          campaignId: campaign.id,
          unsubscribeUrl,
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

  /**
   * Who of `resolved` may get this campaign: email on, not unsubscribed (from
   * all marketing or from this space), and, for platform bulk mail, opted in to
   * promotions. Space campaigns go to the space's own members and attendees on
   * legitimate interest, so they skip the promotions opt-in but always honour
   * the unsubscribe. The count and the send both run through here.
   */
  private async withConsent(
    campaign: Pick<EmailCampaign, 'spaceId' | 'targetType'>,
    resolved: Recipient[],
  ): Promise<Recipient[]> {
    const ids = resolved.flatMap((r) => (r.userId ? [r.userId] : []));
    // 1:1 mail and the staff test list aren't bulk marketing.
    const needsOptIn =
      !campaign.spaceId &&
      campaign.targetType !== EmailTargetType.SINGLE_USER &&
      campaign.targetType !== EmailTargetType.STAFF;
    const [emailOff, optOuts, promotionsOn] = await Promise.all([
      emailOptedOutUserIds(this.prisma, ids),
      marketingOptOuts(this.prisma, MarketingChannel.EMAIL, campaign.spaceId),
      needsOptIn ? promotionsOptedInUserIds(this.prisma, ids) : null,
    ]);
    return resolved.filter(
      (r) =>
        !optOuts.addresses.has(r.email.toLowerCase()) &&
        !(r.userId && (emailOff.has(r.userId) || optOuts.userIds.has(r.userId))) &&
        (!promotionsOn || (!!r.userId && promotionsOn.has(r.userId))),
    );
  }

  private async getRecipients(
    campaign: Pick<EmailCampaign, 'targetType' | 'targetId' | 'segmentFilters'>,
  ): Promise<Recipient[]> {
    // These targets name one space/event/user. A missing id must never widen
    // into "everyone" (Prisma treats `id: undefined` as no filter).
    const needsId: EmailTargetType[] = [
      EmailTargetType.SINGLE_USER,
      EmailTargetType.SPACE_MEMBERS,
      EmailTargetType.EVENT_REGISTRANTS,
      EmailTargetType.WAITLIST,
    ];
    if (needsId.includes(campaign.targetType) && !campaign.targetId) {
      throw new BadRequestException(`${campaign.targetType} needs a targetId`);
    }
    switch (campaign.targetType) {
      case EmailTargetType.SINGLE_USER:
        return this.usersToRecipients(
          await this.prisma.user.findMany({
            where: { id: campaign.targetId!, ...MARKETABLE_USER },
            select: RECIPIENT_SELECT,
          }),
        );

      case EmailTargetType.SPACE_MEMBERS: {
        const members = await this.prisma.userRole.findMany({
          where: { spaceId: campaign.targetId!, user: MARKETABLE_USER },
          distinct: ['userId'],
          include: {
            user: { select: RECIPIENT_SELECT },
          },
        });
        return this.usersToRecipients(members.map((m) => m.user));
      }

      case EmailTargetType.EVENT_REGISTRANTS: {
        // Confirmed attendees only: no unpaid, failed or waiting-list rows.
        const regs = await this.prisma.eventRegistration.findMany({
          where: { eventId: campaign.targetId!, ...COUNTS_AS_ATTENDING },
          select: { userId: true },
        });
        return this.usersToRecipients(
          await this.prisma.user.findMany({
            where: { id: { in: regs.map((r) => r.userId) }, ...MARKETABLE_USER },
            select: RECIPIENT_SELECT,
          }),
        );
      }

      case EmailTargetType.WAITLIST: {
        const waiting = await this.prisma.eventRegistration.findMany({
          where: {
            eventId: campaign.targetId!,
            waitlistStatus: { in: ['WAITING', 'OFFERED'] },
            status: { not: 'CANCELLED' },
          },
          select: { userId: true },
        });
        return this.usersToRecipients(
          await this.prisma.user.findMany({
            where: { id: { in: waiting.map((r) => r.userId) }, ...MARKETABLE_USER },
            select: RECIPIENT_SELECT,
          }),
        );
      }

      case EmailTargetType.ALL_USERS:
        return this.usersToRecipients(
          await this.prisma.user.findMany({
            where: MARKETABLE_USER,
            select: RECIPIENT_SELECT,
          }),
        );

      case EmailTargetType.ORGANISERS_ONLY:
        return this.usersToRecipients(
          await this.prisma.user.findMany({
            where: { createdSpaces: { some: {} }, ...MARKETABLE_USER },
            select: RECIPIENT_SELECT,
            distinct: ['id'],
          }),
        );

      case EmailTargetType.STAFF:
        return this.usersToRecipients(
          await this.prisma.user.findMany({ where: PLATFORM_STAFF_WHERE, select: RECIPIENT_SELECT }),
        );

      case EmailTargetType.SEGMENT:
        return this.usersToRecipients(
          await this.prisma.user.findMany({
            where: {
              ...this.buildSegmentWhere(
                campaign.segmentFilters as unknown as SegmentFiltersDto | null,
              ),
              ...MARKETABLE_USER,
            },
            select: RECIPIENT_SELECT,
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
    unsubscribeUrl?: string,
  ): string {
    let content = this.substituteVars(campaign.body, recipient);
    content = this.rewriteLinks(content, logId);
    // `wrap` defaults on; only the explicit `false` sentinel skips branding.
    // (Campaigns store body only, so we re-wrap here rather than at compose.)
    // The footer's unsubscribe link is added here, after rewriteLinks, so it is
    // never click-tracked.
    const wrapped = this.emailService.wrapCampaignHtml(content, unsubscribeUrl);
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
  sign(url: string, secret = this.trackingSecret): string {
    return createHmac('sha256', secret).update(url).digest('base64url');
  }

  verify(url: string, signature: string): boolean {
    const b = Buffer.from(signature);
    const matches = (secret: string) => {
      const a = Buffer.from(this.sign(url, secret));
      return a.length === b.length && timingSafeEqual(a, b);
    };
    return (
      matches(this.trackingSecret) ||
      (!!this.legacyTrackingSecret &&
        this.legacyTrackingSecret !== this.trackingSecret &&
        matches(this.legacyTrackingSecret))
    );
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
    return this.emailService.wrapCampaignHtml(content, '#');
  }

  // ==========================================================================
  // UNSUBSCRIBE (called by the public UnsubscribeController)
  // ==========================================================================

  /** The signed per-recipient link for the footer and List-Unsubscribe. */
  unsubscribeUrl(email: string, spaceId: string | null): string {
    const t = signUnsubscribeToken(this.unsubscribeSecret, email, spaceId);
    return `${this.baseUrl}/email/unsubscribe?t=${t}`;
  }

  /** What a link is for (email + the space's name, when it is a space's), or null if forged. */
  async readUnsubscribeToken(
    token: string | undefined,
  ): Promise<{ email: string; spaceId: string | null; spaceName: string | null } | null> {
    const claim = verifyUnsubscribeToken(this.unsubscribeSecret, token);
    if (!claim) return null;
    const space = claim.spaceId
      ? await this.prisma.space.findUnique({
          where: { id: claim.spaceId },
          select: { name: true },
        })
      : null;
    return { ...claim, spaceName: space?.name ?? null };
  }

  /**
   * Opt the token's address out of marketing email: from the token's space, or
   * from everything when `everything` is set (or the token has no space).
   * Returns false for a forged token.
   */
  async unsubscribe(
    token: string | undefined,
    opts: { everything: boolean; source: 'link' | 'one_click' },
  ): Promise<boolean> {
    const claim = verifyUnsubscribeToken(this.unsubscribeSecret, token);
    if (!claim) return false;
    const identity = await this.prisma.userIdentity.findFirst({
      where: { email: { equals: claim.email, mode: 'insensitive' } },
      select: { userId: true },
    });
    await recordMarketingOptOut(this.prisma, {
      channel: MarketingChannel.EMAIL,
      address: claim.email,
      spaceId: opts.everything ? null : claim.spaceId,
      userId: identity?.userId,
      source: opts.source,
    });
    return true;
  }
}
