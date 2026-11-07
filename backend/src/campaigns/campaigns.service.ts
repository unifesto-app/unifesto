import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BroadcastKind, Campaign, CampaignScope, CampaignStatus, EmailTargetType, Prisma } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { BROADCAST_DECIDED, BroadcastCheck, type BroadcastDecided } from '../ai/broadcast-check';
import { emailText } from '../ai/risk';
import { formatEventDate, formatEventTime } from '../events/event-dates';
import {
  commsDraftRequest,
  commsDraftSource,
  groundCommsDraft,
  parseCommsDraft,
  type CommsDraftInput,
  type CommsDraftResult,
} from './campaign-draft';
import { attendingUserIds } from '../common/attendance';
import { MARKETABLE_USER, promotionsOptedInUserIds } from '../common/marketing-opt-out';
import { OnEvent } from '../common/on-event';
import { PLATFORM_STAFF_WHERE } from '../common/platform-staff';
import { EmailCampaignsService } from '../email-campaigns/email-campaigns.service';
import { NotificationCategory } from '../notifications/notifications.constants';
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
  DraftCampaignDto,
  TestCampaignDto,
} from './dto/campaign.dto';

type Content = Pick<CampaignMessageDto, 'push' | 'email' | 'whatsapp'>;

/** Who is sending: Apex, a space's console, or an event's managers. */
export type CampaignOwner =
  | { scope: 'PLATFORM' }
  | { scope: 'SPACE'; spaceId: string }
  | { scope: 'EVENT'; spaceId: string; eventId: string };

/** Per-channel delivery counts: message_deliveries rows by status, plus in-app copies. */
export interface ChannelCounts {
  push?: Record<string, number>;
  email?: Record<string, number>;
  whatsapp?: Record<string, number>;
  inapp?: number;
}

/** What an organiser campaign may do, once checked against its owner. */
interface Scoped {
  audience: CampaignAudienceDto;
  category: NotificationCategory;
  /** The event it's about (event audiences): its daily limit and AI19 context. */
  eventId: string | null;
  spaceId: string | null;
}

/** Organiser campaigns a day: per event, or space-wide per space (N4's rule for announcements). */
export const ORGANISER_CAMPAIGNS_PER_DAY = 3;

/**
 * C17: one message, many channels. A campaign resolves its audience once, at
 * send time, and hands each channel to the sender that already owns it: a
 * push campaign (with its in-app copy), an email campaign, a WhatsApp
 * broadcast. Those keep their own consent rules, retries, tracking and
 * history; this row links them and reads their counts back from
 * message_deliveries.
 *
 * Apex sends to anyone on any channel. A space sends to its members and its
 * events' attendees or waitlists, and an event's managers to that event's;
 * neither has WhatsApp (owner, 7 Nov: Meta bills per message). An organiser
 * campaign is read by AI19 as one message before any channel gets it.
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
    @Optional() private readonly broadcastCheck?: BroadcastCheck,
    @Optional() private readonly ai?: AiService,
  ) {}

  /**
   * Write with AI: Haiku drafts the chosen channels from the sender's line and
   * the event's own facts. Returns words for the composer; sends nothing.
   * A channel that quotes something it wasn't given is left out (AI10).
   */
  async draft(owner: CampaignOwner, userId: string, dto: DraftCampaignDto): Promise<CommsDraftResult> {
    if (owner.scope !== 'PLATFORM') assertNoWhatsapp(dto);
    if (!this.ai) return { ok: false, reason: 'disabled' };
    const eventId = owner.scope === 'EVENT' ? owner.eventId : (dto.eventId ?? null);
    const [event, space] = await Promise.all([
      eventId
        ? this.prisma.event.findFirst({
            where: { id: eventId, ...(owner.scope === 'PLATFORM' ? {} : { spaceId: owner.spaceId }) },
            select: {
              title: true,
              slug: true,
              type: true,
              timezone: true,
              startDateTime: true,
              endDateTime: true,
              venueName: true,
              city: true,
              ticketTypes: { select: { name: true, price: true } },
            },
          })
        : null,
      owner.scope === 'PLATFORM' ? null : this.prisma.space.findUnique({ where: { id: owner.spaceId }, select: { name: true } }),
    ]);
    if (eventId && !event) throw new ForbiddenException('That event is not in this space.');

    const input: CommsDraftInput = {
      line: dto.line,
      from: space?.name ?? 'Unifesto',
      push: dto.channels.includes('push') || dto.channels.includes('inapp'),
      email: dto.channels.includes('email'),
      whatsapp: owner.scope === 'PLATFORM' && dto.channels.includes('whatsapp') ? (dto.whatsapp ?? null) : null,
      event: event && {
        title: event.title,
        when: `${formatEventDate(event.startDateTime, event.timezone)}, ${formatEventTime(event.startDateTime, event.endDateTime, event.timezone)}`,
        venue: event.type === 'ONLINE' ? 'Online' : [event.venueName, event.city].filter(Boolean).join(', ') || null,
        tickets: event.ticketTypes.length
          ? event.ticketTypes.map((t) => `${t.name} ${Number(t.price) > 0 ? `₹${Number(t.price)}` : 'free'}`).join(', ')
          : null,
        link: `https://unifesto.app/event/${event.slug}`,
      },
      today: new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    };
    const res = await this.ai.run('comms_draft', {
      ...commsDraftRequest(input),
      userId,
      subject: `campaign-draft:${owner.scope === 'PLATFORM' ? 'platform' : owner.spaceId}`,
      ...(owner.scope === 'PLATFORM' ? {} : { spaceId: owner.spaceId, billable: true }),
    });
    if (!res.ok) return { ok: false, reason: res.reason };
    const parsed = parseCommsDraft(res.json, input);
    if (!parsed) return { ok: false, reason: 'empty' };
    const { draft, dropped } = groundCommsDraft(parsed, commsDraftSource(input));
    if (!draft.push && !draft.email && !draft.whatsappParams) return { ok: false, reason: 'held', why: dropped[0] };
    return { ok: true, draft, ...(dropped.length ? { dropped } : {}) };
  }

  /** Save it, then send now (awaited, so the reply says what went) or leave it SCHEDULED. */
  async create(owner: CampaignOwner, createdById: string, dto: CreateCampaignDto): Promise<Campaign> {
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (scheduledAt && scheduledAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('That time has passed.');
    }
    const s = await this.scoped(owner, dto);
    if (owner.scope !== 'PLATFORM') await this.assertUnderLimit(s);
    if (!scheduledAt) await this.platformConfig?.assertCommsOpen();
    const campaign = await this.prisma.campaign.create({
      data: {
        scope: owner.scope as CampaignScope,
        spaceId: s.spaceId,
        eventId: s.eventId,
        createdById,
        channels: dto.channels,
        category: s.category,
        audience: s.audience as unknown as Prisma.InputJsonValue,
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
  async count(owner: CampaignOwner, dto: CampaignCountDto): Promise<{ audience: number } & Partial<Record<CampaignChannel, number>>> {
    const s = await this.scoped(owner, dto);
    const userIds = await resolveAudience(this.prisma, s.audience, owner.scope === 'SPACE' ? s.spaceId : null);
    const target = channelTargets(s.audience, userIds);
    const out: { audience: number } & Partial<Record<CampaignChannel, number>> = { audience: userIds.length };
    if (dto.channels.includes('push')) {
      out.push = (await this.push.countAudience(target.push, s.category)).recipientCount;
    } else if (dto.channels.includes('inapp')) {
      out.inapp = s.category === 'promotions' ? (await promotionsOptedInUserIds(this.prisma, userIds)).size : userIds.length;
    }
    if (dto.channels.includes('email')) {
      out.email = (await this.email.countAudience({ spaceId: s.spaceId }, target.email, true)).recipientCount;
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

  /** Each chosen channel to the sender only. One failing doesn't stop the rest. */
  async sendTest(owner: CampaignOwner, userId: string, dto: TestCampaignDto): Promise<{ sent: CampaignChannel[]; errors: string[] }> {
    if (owner.scope !== 'PLATFORM') assertNoWhatsapp(dto);
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
      await step('push', () => this.push.sendTest(userId, push));
    } else if (push && dto.channels.includes('inapp')) {
      await step('inapp', () =>
        this.notifications.send([userId], { category: 'productUpdates', ...push, title: `[Test] ${push.title}`, inboxOnly: true }),
      );
    }
    if (email && dto.channels.includes('email')) {
      await step('email', () => this.email.sendTest(userId, { subject: email.subject, body: email.html }));
    }
    if (whatsapp && dto.channels.includes('whatsapp')) {
      await step('whatsapp', () =>
        this.whatsapp.sendBroadcastTemplate({ adminUserId: userId, audience: 'USER', userIds: [userId], test: true, ...whatsapp }),
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
    const category = campaign.category as NotificationCategory;
    if (!(await this.cleared(campaign, content))) return;

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
      const withinSpace = campaign.scope === CampaignScope.SPACE ? campaign.spaceId : null;
      const userIds = await resolveAudience(this.prisma, audience, withinSpace);
      linked.recipientCount = userIds.length;
      if (userIds.length === 0) throw new Error('Nobody in this audience');
      const target = channelTargets(audience, userIds);
      const { push, email, whatsapp } = content;

      if (push && has('push')) {
        await step('push', async () => {
          const row = await this.push.createBroadcast(campaign.createdById, {
            ...push,
            category,
            target: target.push,
            eventId: campaign.eventId,
          });
          linked.pushCampaignId = row.id;
        });
      } else if (push && has('inapp')) {
        await step('inapp', async () => {
          const summary = await this.notifications.send(userIds, {
            category,
            ...push,
            data: { type: 'campaign', ...(campaign.eventId ? { eventId: campaign.eventId } : {}) },
            inboxOnly: true,
          });
          linked.inAppCount = summary.skipped;
        });
      }
      if (email && has('email')) {
        await step('email', async () => {
          const res = await this.email.createCampaign(
            { spaceId: campaign.spaceId },
            campaign.createdById,
            { ...target.email, subject: email.subject, body: email.html },
            campaign.id,
          );
          linked.emailCampaignId = res.campaignId;
        });
      }
      if (whatsapp && has('whatsapp') && campaign.scope === CampaignScope.PLATFORM) {
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

  /**
   * AI19 on an organiser campaign: every channel's words, read once before
   * any channel gets them. A held one waits as HELD for staff.
   */
  private async cleared(campaign: Campaign, content: Content): Promise<boolean> {
    if (campaign.scope === CampaignScope.PLATFORM || !this.broadcastCheck) return true;
    const { push, email } = content;
    const ok = await this.broadcastCheck.clear({
      kind: BroadcastKind.CAMPAIGN,
      refId: campaign.id,
      spaceId: campaign.spaceId,
      eventId: campaign.eventId,
      senderId: campaign.createdById,
      text: [
        ...(push ? [push.title, push.body, ...(push.deepLink ? [`Link: ${push.deepLink}`] : [])] : []),
        ...(email ? [emailText(email.subject, email.html)] : []),
      ].join('\n\n'),
    });
    if (!ok) {
      await this.prisma.campaign.update({ where: { id: campaign.id }, data: { status: CampaignStatus.HELD } });
      this.logger.warn(`Campaign ${campaign.id} held for staff review (AI19)`);
    }
    return ok;
  }

  /** Staff released (back to DRAFT, then sent) or blocked (CANCELLED) a held campaign. */
  @OnEvent(BROADCAST_DECIDED, { async: true })
  async onBroadcastDecided(e: BroadcastDecided): Promise<void> {
    if (e.kind !== BroadcastKind.CAMPAIGN) return;
    const moved = await this.prisma.campaign.updateMany({
      where: { id: e.refId, status: CampaignStatus.HELD },
      data: { status: e.release ? CampaignStatus.DRAFT : CampaignStatus.CANCELLED },
    });
    if (moved.count && e.release) await this.dispatch(e.refId);
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

  async cancel(owner: CampaignOwner, id: string): Promise<{ status: CampaignStatus }> {
    const { count } = await this.prisma.campaign.updateMany({
      where: { id, ...ownedBy(owner), status: { in: [CampaignStatus.DRAFT, CampaignStatus.SCHEDULED] } },
      data: { status: CampaignStatus.CANCELLED },
    });
    if (!count) throw new BadRequestException('Only a campaign that has not gone out can be cancelled.');
    return { status: CampaignStatus.CANCELLED };
  }

  async list(owner: CampaignOwner, page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 100);
    const where = ownedBy(owner);
    const [rows, total] = await Promise.all([
      this.prisma.campaign.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (Math.max(page, 1) - 1) * take, take }),
      this.prisma.campaign.count({ where }),
    ]);
    const counts = await this.countsFor(rows);
    return { campaigns: rows.map((r) => ({ ...r, counts: counts.get(r.id) ?? {} })), total, page, limit: take };
  }

  async get(owner: CampaignOwner, id: string) {
    const row = await this.prisma.campaign.findFirst({ where: { id, ...ownedBy(owner) } });
    if (!row) throw new NotFoundException('Campaign not found');
    return { ...row, counts: (await this.countsFor([row])).get(row.id) ?? {} };
  }

  /**
   * Check an organiser's campaign against what they own and pin its
   * audience, category and event. Apex campaigns pass through as asked.
   */
  private async scoped(owner: CampaignOwner, dto: Pick<CreateCampaignDto, 'audience' | 'channels' | 'category'>): Promise<Scoped> {
    if (owner.scope === 'PLATFORM') {
      const eventId = dto.audience.type === 'event' || dto.audience.type === 'waitlist' ? dto.audience.eventId ?? null : null;
      return { audience: dto.audience, category: dto.category ?? 'productUpdates', eventId, spaceId: null };
    }
    assertNoWhatsapp(dto);
    const a = dto.audience;
    if (owner.scope === 'EVENT') {
      if (a.type !== 'event' && a.type !== 'waitlist') throw new ForbiddenException('An event sends to its attendees or its waitlist.');
      return {
        audience: { type: a.type, eventId: owner.eventId },
        category: 'organiserAnnouncements',
        eventId: owner.eventId,
        spaceId: owner.spaceId,
      };
    }
    switch (a.type) {
      case 'space':
        // Space news, not a live event message: the member's "space updates" switch and the daily cap apply.
        return { audience: { type: 'space', spaceId: owner.spaceId }, category: 'spaceUpdates', eventId: null, spaceId: owner.spaceId };
      case 'users':
        return { audience: { type: 'users', userIds: a.userIds }, category: 'spaceUpdates', eventId: null, spaceId: owner.spaceId };
      case 'event':
      case 'waitlist': {
        const event = await this.prisma.event.findFirst({ where: { id: a.eventId, spaceId: owner.spaceId }, select: { id: true } });
        if (!event) throw new ForbiddenException('That event is not in this space.');
        return { audience: { type: a.type, eventId: event.id }, category: 'organiserAnnouncements', eventId: event.id, spaceId: owner.spaceId };
      }
      default:
        throw new ForbiddenException('A space sends to its members, its events, or people in it.');
    }
  }

  /** N4 for campaigns: a few a day per event, or space-wide per space. Cancelled ones don't count. */
  private async assertUnderLimit(s: Scoped): Promise<void> {
    const recent = await this.prisma.campaign.count({
      where: {
        ...(s.eventId ? { eventId: s.eventId } : { spaceId: s.spaceId, eventId: null }),
        status: { not: CampaignStatus.CANCELLED },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (recent >= ORGANISER_CAMPAIGNS_PER_DAY) {
      throw new ForbiddenException(
        `Up to ${ORGANISER_CAMPAIGNS_PER_DAY} campaigns a day ${s.eventId ? 'for this event' : 'to the whole space'}. Try again tomorrow.`,
      );
    }
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
}

/**
 * The one audience resolver: open accounts only. Each channel then applies
 * its own switches, unsubscribes and the daily cap (C16). `withinSpace`
 * keeps a space's picked people to its own members.
 */
export async function resolveAudience(
  prisma: PrismaService,
  a: CampaignAudienceDto,
  withinSpace: string | null = null,
): Promise<string[]> {
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
      where = { id: { in: a.userIds ?? [] }, ...(withinSpace ? { roles: { some: { spaceId: withinSpace } } } : {}) };
      break;
    default:
      throw new BadRequestException('Unknown audience');
  }
  const users = await prisma.user.findMany({ where: { AND: [where, MARKETABLE_USER] }, select: { id: true } });
  return users.map((u) => u.id);
}

/** Campaigns the owner may see: Apex's own, a space's (its events' too), or one event's. */
function ownedBy(owner: CampaignOwner): Prisma.CampaignWhereInput {
  if (owner.scope === 'PLATFORM') return { scope: CampaignScope.PLATFORM };
  if (owner.scope === 'SPACE') return { spaceId: owner.spaceId };
  return { eventId: owner.eventId };
}

function assertNoWhatsapp(dto: { channels: CampaignChannel[] }): void {
  if (dto.channels.includes('whatsapp')) {
    throw new ForbiddenException('WhatsApp campaigns are sent by Unifesto only.');
  }
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
