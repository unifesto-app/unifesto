import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Campaign, CampaignScope, CampaignStatus, EmailTargetType, Prisma } from '@prisma/client';
import { attendingUserIds } from '../common/attendance';
import { MARKETABLE_USER, promotionsOptedInUserIds } from '../common/marketing-opt-out';
import { PLATFORM_STAFF_WHERE } from '../common/platform-staff';
import { EmailCampaignsService } from '../email-campaigns/email-campaigns.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushCampaignService } from '../notifications/push-campaign.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformConfigService } from '../subscription/platform-config.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import {
  CampaignAudienceDto,
  CampaignChannel,
  CampaignCountDto,
  CampaignMessageDto,
  CreateCampaignDto,
  TestCampaignDto,
} from './dto/campaign.dto';

type Content = Pick<CampaignMessageDto, 'push' | 'email' | 'whatsapp'>;
type Category = 'productUpdates' | 'promotions';

/** Per-channel delivery counts: message_deliveries rows by status, plus in-app copies. */
export interface ChannelCounts {
  push?: Record<string, number>;
  email?: Record<string, number>;
  whatsapp?: Record<string, number>;
  inapp?: number;
}

/**
 * C17: one message, many channels. A campaign resolves its audience once, at
 * send time, and hands each channel to the sender that already owns it: a
 * push campaign (with its in-app copy), an email campaign, a WhatsApp
 * broadcast. Those keep their own consent rules, retries, tracking and
 * history; this row links them and reads their counts back from
 * message_deliveries.
 *
 * Platform (Apex) campaigns only. Space and event campaigns, and the AI19
 * check they need, come next.
 */
@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly push: PushCampaignService,
    private readonly email: EmailCampaignsService,
    private readonly whatsapp: WhatsAppService,
    @Optional() private readonly platformConfig?: PlatformConfigService,
  ) {}

  /** Save it, then send now (awaited, so the reply says what went) or leave it SCHEDULED. */
  async create(createdById: string, dto: CreateCampaignDto): Promise<Campaign> {
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (scheduledAt && scheduledAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('That time has passed.');
    }
    if (!scheduledAt) await this.platformConfig?.assertCommsOpen();
    const campaign = await this.prisma.campaign.create({
      data: {
        scope: CampaignScope.PLATFORM,
        createdById,
        channels: dto.channels,
        category: dto.category ?? 'productUpdates',
        audience: dto.audience as unknown as Prisma.InputJsonValue,
        content: pickContent(dto) as Prisma.InputJsonValue,
        brief: dto.brief ?? null,
        status: scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.DRAFT,
        scheduledAt,
      },
    });
    if (scheduledAt) return campaign;
    await this.dispatch(campaign.id);
    return this.prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
  }

  /** Who each channel would reach right now, after its own opt-outs. */
  async count(dto: CampaignCountDto): Promise<{ audience: number } & Partial<Record<CampaignChannel, number>>> {
    const userIds = await resolveAudience(this.prisma, dto.audience);
    const category = dto.category ?? 'productUpdates';
    const target = channelTargets(dto.audience, userIds);
    const out: { audience: number } & Partial<Record<CampaignChannel, number>> = { audience: userIds.length };
    if (dto.channels.includes('push')) {
      out.push = (await this.push.countAudience(target.push, category)).recipientCount;
    } else if (dto.channels.includes('inapp')) {
      out.inapp = await this.inAppReach(userIds, category);
    }
    if (dto.channels.includes('email')) {
      out.email = (await this.email.countAudience({ spaceId: null }, target.email)).recipientCount;
    }
    if (dto.channels.includes('whatsapp') && dto.whatsapp) {
      out.whatsapp = (
        await this.whatsapp.resolveBroadcastRecipients({
          ...target.whatsapp,
          templateName: dto.whatsapp.templateName,
          languageCode: dto.whatsapp.languageCode,
        })
      ).length;
    }
    return out;
  }

  /** Each chosen channel to the signed-in admin only. One failing doesn't stop the rest. */
  async sendTest(adminId: string, dto: TestCampaignDto): Promise<{ sent: CampaignChannel[]; errors: string[] }> {
    const sent: CampaignChannel[] = [];
    const errors: string[] = [];
    const step = async (channel: CampaignChannel, run: () => Promise<unknown>) => {
      try {
        await run();
        sent.push(channel);
      } catch (err) {
        errors.push(`${channel}: ${message(err)}`);
      }
    };
    const { push, email, whatsapp } = dto;
    if (push && dto.channels.includes('push')) {
      await step('push', () => this.push.sendTest(adminId, push));
    } else if (push && dto.channels.includes('inapp')) {
      await step('inapp', () =>
        this.notifications.send([adminId], { category: 'productUpdates', ...push, title: `[Test] ${push.title}`, inboxOnly: true }),
      );
    }
    if (email && dto.channels.includes('email')) {
      await step('email', () => this.email.sendTest(adminId, { subject: email.subject, body: email.html }));
    }
    if (whatsapp && dto.channels.includes('whatsapp')) {
      await step('whatsapp', () =>
        this.whatsapp.sendBroadcastTemplate({ adminUserId: adminId, audience: 'USER', userIds: [adminId], test: true, ...whatsapp }),
      );
    }
    return { sent, errors };
  }

  /**
   * Hand each channel off. Idempotent: the DRAFT/SCHEDULED → SENDING claim is
   * a guarded update, so a double click or two replicas' sweeps send once.
   */
  async dispatch(id: string): Promise<void> {
    // Paused: a scheduled one stays SCHEDULED and goes when sends resume.
    if (await this.platformConfig?.isCommsPaused()) return;
    const claim = await this.prisma.campaign.updateMany({
      where: { id, status: { in: [CampaignStatus.DRAFT, CampaignStatus.SCHEDULED] } },
      data: { status: CampaignStatus.SENDING },
    });
    if (claim.count !== 1) return;

    const campaign = await this.prisma.campaign.findUniqueOrThrow({ where: { id } });
    const audience = campaign.audience as unknown as CampaignAudienceDto;
    const content = campaign.content as Content;
    const category = campaign.category as Category;
    const has = (c: CampaignChannel) => campaign.channels.includes(c);
    const errors: string[] = [];
    const linked: Prisma.CampaignUpdateInput = {};
    let handedOff = 0;
    const step = async (channel: CampaignChannel, run: () => Promise<void>) => {
      try {
        await run();
        handedOff++;
      } catch (err) {
        errors.push(`${channel}: ${message(err)}`);
      }
    };

    try {
      const userIds = await resolveAudience(this.prisma, audience);
      linked.recipientCount = userIds.length;
      if (userIds.length === 0) throw new Error('Nobody in this audience');
      const target = channelTargets(audience, userIds);
      const { push, email, whatsapp } = content;

      if (push && has('push')) {
        await step('push', async () => {
          const row = await this.push.createBroadcast(campaign.createdById, { ...push, category, target: target.push });
          linked.pushCampaignId = row.id;
        });
      } else if (push && has('inapp')) {
        await step('inapp', async () => {
          const summary = await this.notifications.send(userIds, {
            category,
            ...push,
            data: { type: 'campaign' },
            inboxOnly: true,
          });
          linked.inAppCount = summary.skipped;
        });
      }
      if (email && has('email')) {
        await step('email', async () => {
          const res = await this.email.createCampaign({ spaceId: null }, campaign.createdById, {
            ...target.email,
            subject: email.subject,
            body: email.html,
          });
          linked.emailCampaignId = res.campaignId;
        });
      }
      if (whatsapp && has('whatsapp')) {
        await step('whatsapp', async () => {
          const res = await this.whatsapp.sendBroadcastTemplate({
            adminUserId: campaign.createdById,
            ...target.whatsapp,
            ...whatsapp,
          });
          linked.whatsappBroadcastId = res.broadcastId;
        });
      }
    } catch (err) {
      errors.push(message(err));
    }

    await this.prisma.campaign.update({
      where: { id },
      data: {
        ...linked,
        status: handedOff ? CampaignStatus.SENT : CampaignStatus.FAILED,
        sentAt: handedOff ? new Date() : null,
        error: errors.length ? errors.join('\n').slice(0, 4000) : null,
      },
    });
    this.logger.log(`Campaign ${id}: ${handedOff} channel(s) handed off${errors.length ? `; ${errors.join('; ')}` : ''}`);
  }

  /** Scheduled campaigns that are due. Each claim is guarded, so replicas can't double-send. */
  @Cron(CronExpression.EVERY_MINUTE)
  async sweepScheduled(now = new Date()): Promise<number> {
    const due = await this.prisma.campaign.findMany({
      where: { status: CampaignStatus.SCHEDULED, scheduledAt: { lte: now } },
      select: { id: true },
      orderBy: { scheduledAt: 'asc' },
      take: 20,
    });
    for (const { id } of due) await this.dispatch(id);
    return due.length;
  }

  async cancel(id: string): Promise<{ status: CampaignStatus }> {
    const { count } = await this.prisma.campaign.updateMany({
      where: { id, scope: CampaignScope.PLATFORM, status: { in: [CampaignStatus.DRAFT, CampaignStatus.SCHEDULED] } },
      data: { status: CampaignStatus.CANCELLED },
    });
    if (!count) throw new BadRequestException('Only a campaign that has not gone out can be cancelled.');
    return { status: CampaignStatus.CANCELLED };
  }

  async list(page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 100);
    const where = { scope: CampaignScope.PLATFORM };
    const [rows, total] = await Promise.all([
      this.prisma.campaign.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (Math.max(page, 1) - 1) * take, take }),
      this.prisma.campaign.count({ where }),
    ]);
    const counts = await this.countsFor(rows);
    return { campaigns: rows.map((r) => ({ ...r, counts: counts.get(r.id) ?? {} })), total, page, limit: take };
  }

  async get(id: string) {
    const row = await this.prisma.campaign.findFirst({ where: { id, scope: CampaignScope.PLATFORM } });
    if (!row) throw new NotFoundException('Campaign not found');
    return { ...row, counts: (await this.countsFor([row])).get(row.id) ?? {} };
  }

  /** Each channel campaign's delivery rows by status, in one query. */
  private async countsFor(rows: Campaign[]): Promise<Map<string, ChannelCounts>> {
    const owner = new Map<string, { campaignId: string; channel: 'push' | 'email' | 'whatsapp' }>();
    for (const r of rows) {
      if (r.pushCampaignId) owner.set(r.pushCampaignId, { campaignId: r.id, channel: 'push' });
      if (r.emailCampaignId) owner.set(r.emailCampaignId, { campaignId: r.id, channel: 'email' });
      if (r.whatsappBroadcastId) owner.set(r.whatsappBroadcastId, { campaignId: r.id, channel: 'whatsapp' });
    }
    const out = new Map<string, ChannelCounts>(
      rows.map((r) => [r.id, r.channels.includes('inapp') && !r.channels.includes('push') ? { inapp: r.inAppCount } : {}]),
    );
    if (owner.size === 0) return out;
    const groups = await this.prisma.messageDelivery.groupBy({
      by: ['campaignId', 'status'],
      where: { campaignId: { in: [...owner.keys()] } },
      _count: { _all: true },
    });
    for (const g of groups) {
      const o = g.campaignId ? owner.get(g.campaignId) : undefined;
      if (!o) continue;
      const counts = out.get(o.campaignId)!;
      const byStatus = (counts[o.channel] ??= {});
      byStatus[g.status] = (byStatus[g.status] ?? 0) + g._count._all;
    }
    return out;
  }

  /** In-app only: everyone, except promotions, which only lands with those who opted in. */
  private async inAppReach(userIds: string[], category: Category): Promise<number> {
    return category === 'promotions' ? (await promotionsOptedInUserIds(this.prisma, userIds)).size : userIds.length;
  }
}

/**
 * The one audience resolver: open accounts only. Each channel then applies
 * its own switches, unsubscribes and the daily cap (C16).
 */
export async function resolveAudience(prisma: PrismaService, a: CampaignAudienceDto): Promise<string[]> {
  let where: Prisma.UserWhereInput;
  switch (a.type) {
    case 'all':
      where = {};
      break;
    case 'space':
      where = { roles: { some: { spaceId: a.spaceId } } };
      break;
    case 'event':
      where = { id: { in: await attendingUserIds(prisma, a.eventId!) } };
      break;
    case 'waitlist':
      where = {
        registrations: {
          some: { eventId: a.eventId, waitlistStatus: { in: ['WAITING', 'OFFERED'] }, status: { not: 'CANCELLED' } },
        },
      };
      break;
    case 'organisers':
      where = { createdSpaces: { some: {} } };
      break;
    case 'staff':
      where = PLATFORM_STAFF_WHERE;
      break;
    case 'users':
      where = { id: { in: a.userIds ?? [] } };
      break;
    default:
      throw new BadRequestException('Unknown audience');
  }
  const users = await prisma.user.findMany({ where: { AND: [where, MARKETABLE_USER] }, select: { id: true } });
  return users.map((u) => u.id);
}

/**
 * What each channel is handed. Staff is each channel's own staff test target
 * (no marketing consent, marked as a test); everyone else goes as the
 * resolved list, so every channel reaches the same people.
 * ponytail: the list is copied into each channel row; store an audience
 * reference instead if audiences outgrow ~50k people.
 */
function channelTargets(a: CampaignAudienceDto, userIds: string[]) {
  const staff = a.type === 'staff';
  return {
    push: staff ? { type: 'staff' as const } : { type: 'users' as const, userIds },
    email: staff
      ? { targetType: EmailTargetType.STAFF }
      : { targetType: EmailTargetType.SEGMENT, segmentFilters: { userIds } },
    whatsapp: staff ? { audience: 'STAFF' as const } : { audience: 'USER' as const, userIds },
  };
}

/** Only the chosen channels' words are kept. */
function pickContent(dto: CampaignMessageDto): Content {
  const has = (c: CampaignChannel) => dto.channels.includes(c);
  return {
    ...(dto.push && (has('push') || has('inapp')) ? { push: dto.push } : {}),
    ...(dto.email && has('email') ? { email: dto.email } : {}),
    ...(dto.whatsapp && has('whatsapp') ? { whatsapp: dto.whatsapp } : {}),
  };
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
