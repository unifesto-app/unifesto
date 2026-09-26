import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  PushCampaign,
  PushCampaignStatus,
  PushScope,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { NotificationsService } from './notifications.service';
import { NotificationCategory } from './notifications.constants';
import { COUNTS_AS_ATTENDING } from '../common/attendance';
import {
  CreateOrganiserAnnouncementDto,
  CreatePushBroadcastDto,
} from './dto/push-campaign.dto';

interface TargetSegment {
  type: 'all' | 'event' | 'space' | 'users';
  eventId?: string;
  spaceId?: string;
  userIds?: string[];
}

// N4: cap organiser announcements so an event can't be spammed.
const ORGANISER_ANNOUNCEMENTS_PER_DAY = 3;

// OneSignal segment used by the all-users broadcast fallback so unlinked devices
// (no external_id) still receive it. "Total Subscriptions" is the built-in segment
// on current OneSignal apps (the legacy "Subscribed Users" does not exist on ours,
// so every broadcast was rejected); overridable for accounts that renamed it.
const BROADCAST_SEGMENT = process.env.ONESIGNAL_BROADCAST_SEGMENT || 'Total Subscriptions';

@Injectable()
export class PushCampaignService {
  private readonly logger = new Logger(PushCampaignService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly events: EventsService,
  ) {}

  // ── Admin broadcasts ────────────────────────────────────────────────────────

  async createBroadcast(adminId: string, dto: CreatePushBroadcastDto): Promise<PushCampaign> {
    const data = {
      ...(dto.data ?? {}),
      ...(dto.deepLink ? { deepLink: dto.deepLink } : {}),
    };
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;

    const campaign = await this.prisma.pushCampaign.create({
      data: {
        scope: PushScope.PLATFORM,
        createdById: adminId,
        title: dto.title,
        body: dto.body,
        data: data as Prisma.InputJsonValue,
        // Default to the opt-out product-announcement category so an admin
        // broadcast actually reaches users unless they pick marketing.
        category: dto.category ?? 'productUpdates',
        targetSegment: dto.target as unknown as Prisma.InputJsonValue,
        status: scheduledAt ? PushCampaignStatus.SCHEDULED : PushCampaignStatus.DRAFT,
        scheduledAt,
      },
    });

    // Immediate broadcasts fire now; scheduled ones are picked up by the worker.
    if (!scheduledAt) {
      void this.dispatch(campaign.id);
    }
    return campaign;
  }

  /** Admin re-trigger of a DRAFT/SCHEDULED campaign. */
  async sendNow(id: string): Promise<{ status: string }> {
    const campaign = await this.prisma.pushCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    const sendable: PushCampaignStatus[] = [
      PushCampaignStatus.DRAFT,
      PushCampaignStatus.SCHEDULED,
    ];
    if (!sendable.includes(campaign.status)) {
      throw new BadRequestException(`Campaign is ${campaign.status}, cannot send`);
    }
    void this.dispatch(id);
    return { status: 'dispatching' };
  }

  async cancel(id: string): Promise<{ status: string }> {
    // Only a not-yet-sent campaign can be cancelled.
    const res = await this.prisma.pushCampaign.updateMany({
      where: { id, status: { in: [PushCampaignStatus.DRAFT, PushCampaignStatus.SCHEDULED] } },
      data: { status: PushCampaignStatus.CANCELLED },
    });
    if (res.count !== 1) {
      throw new BadRequestException('Campaign cannot be cancelled (already sending or sent)');
    }
    return { status: 'cancelled' };
  }

  async list(page = 1, limit = 20, status?: string[]) {
    const where: Prisma.PushCampaignWhereInput = status?.length
      ? { status: { in: status as PushCampaignStatus[] } }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.pushCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.pushCampaign.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async getById(id: string): Promise<PushCampaign> {
    const campaign = await this.prisma.pushCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  // ── Organiser announcements ─────────────────────────────────────────────────

  async createOrganiserAnnouncement(
    userId: string,
    eventId: string,
    dto: CreateOrganiserAnnouncementDto,
  ): Promise<PushCampaign> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, spaceId: true, slug: true, title: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    // Scoped auth: only an organiser/co-organiser of this event (or a co-host).
    const canManage = await this.events.canManageEvent(userId, event.spaceId, event.id);
    if (!canManage) {
      throw new ForbiddenException('You cannot announce to this event');
    }

    // N4 rate limit: per-event per-24h cap.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await this.prisma.pushCampaign.count({
      where: { scope: PushScope.EVENT, eventId, createdAt: { gte: since } },
    });
    if (recent >= ORGANISER_ANNOUNCEMENTS_PER_DAY) {
      throw new ForbiddenException(
        `Announcement limit reached (${ORGANISER_ANNOUNCEMENTS_PER_DAY}/day for this event). Try again later.`,
      );
    }

    const deepLink = dto.deepLink || `unifesto://event/${event.slug}`;
    const campaign = await this.prisma.pushCampaign.create({
      data: {
        scope: PushScope.EVENT,
        eventId,
        createdById: userId,
        title: dto.title,
        body: dto.body,
        data: { deepLink } as Prisma.InputJsonValue,
        targetSegment: { type: 'event', eventId } as unknown as Prisma.InputJsonValue,
        status: PushCampaignStatus.DRAFT,
      },
    });
    void this.dispatch(campaign.id);
    return campaign;
  }

  // ── Core dispatch (idempotent) ──────────────────────────────────────────────

  /**
   * Send a campaign. Idempotent + concurrency-safe: the DRAFT/SCHEDULED→SENDING
   * transition is a guarded conditional update (N3), so a worker retry or a
   * double-click can't double-send. PushLog's @@unique([campaignId, userId])
   * backstops per-recipient duplication.
   */
  async dispatch(campaignId: string): Promise<void> {
    const claim = await this.prisma.pushCampaign.updateMany({
      where: {
        id: campaignId,
        status: { in: [PushCampaignStatus.DRAFT, PushCampaignStatus.SCHEDULED] },
      },
      data: { status: PushCampaignStatus.SENDING },
    });
    if (claim.count !== 1) {
      // Someone else already moved it out of DRAFT/SCHEDULED.
      return;
    }

    try {
      const campaign = await this.prisma.pushCampaign.findUniqueOrThrow({
        where: { id: campaignId },
      });
      // EVENT scope always sends as an organiser announcement; PLATFORM scope
      // uses the category the admin chose at compose time (productUpdates/promotions).
      const category: NotificationCategory =
        campaign.scope === PushScope.EVENT
          ? 'organiserAnnouncements'
          : (campaign.category as NotificationCategory);
      const deepLink = (campaign.data as any)?.deepLink as string | undefined;
      const data = (campaign.data as Record<string, unknown>) ?? undefined;

      // All-users broadcasts of an opt-OUT category fan out to the whole
      // subscribed segment — this reaches devices with no external_id linkage,
      // which enumerated external_id targeting cannot. Opt-IN promotions must
      // never segment-blast (that would send marketing to non-consenting users),
      // so they stay on the enumerated + pref-filtered path.
      const segment = (campaign.targetSegment as unknown as TargetSegment) ?? { type: 'all' };
      const useSegment =
        campaign.scope === PushScope.PLATFORM &&
        segment.type === 'all' &&
        category !== 'promotions';

      let summary;
      if (useSegment) {
        summary = await this.notifications.sendToSegments([BROADCAST_SEGMENT], {
          title: campaign.title,
          body: campaign.body,
          data,
          deepLink,
        });
      } else {
        const userIds = await this.resolveRecipients(campaign);
        summary = await this.notifications.send(userIds, {
          category,
          title: campaign.title,
          body: campaign.body,
          data,
          deepLink,
          campaignId: campaign.id,
        });
      }

      await this.prisma.pushCampaign.update({
        where: { id: campaignId },
        data: {
          status: PushCampaignStatus.SENT,
          sentAt: new Date(),
          sentCount: summary.sent,
          failedCount: summary.failed,
        },
      });
      this.logger.log(
        `Campaign ${campaignId} sent (${useSegment ? `segment:${BROADCAST_SEGMENT}` : 'external_id'}): ` +
          `${summary.sent} sent, ${summary.failed} failed, ${summary.skipped} skipped`,
      );
    } catch (err: any) {
      this.logger.error(`Campaign ${campaignId} dispatch failed: ${err?.message ?? err}`);
      await this.prisma.pushCampaign
        .update({ where: { id: campaignId }, data: { status: PushCampaignStatus.FAILED } })
        .catch(() => undefined);
    }
  }

  private async resolveRecipients(campaign: PushCampaign): Promise<string[]> {
    const segment = (campaign.targetSegment as unknown as TargetSegment) ?? { type: 'all' };

    // Event-scoped (organiser) or admin broadcast targeting one event.
    const eventId = campaign.eventId ?? segment.eventId;
    if (campaign.scope === PushScope.EVENT || segment.type === 'event') {
      if (!eventId) return [];
      const regs = await this.prisma.eventRegistration.findMany({
        where: { eventId, ...COUNTS_AS_ATTENDING },
        select: { userId: true },
      });
      return [...new Set(regs.map((r) => r.userId))];
    }

    if (segment.type === 'space') {
      if (!segment.spaceId) return [];
      const members = await this.prisma.userRole.findMany({
        where: { spaceId: segment.spaceId },
        select: { userId: true },
      });
      return [...new Set(members.map((m) => m.userId))];
    }

    if (segment.type === 'users') {
      // Only ids that still resolve to an account; a deleted user just drops out.
      if (!segment.userIds?.length) return [];
      const users = await this.prisma.user.findMany({
        where: { id: { in: segment.userIds } },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }

    // type 'all' — every user (pref opt-out enforced in NotificationsService.send).
    const users = await this.prisma.user.findMany({ select: { id: true } });
    return users.map((u) => u.id);
  }
}
