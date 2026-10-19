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
import { NotificationsService, SendSummary } from './notifications.service';
import { OneSignalService } from './onesignal.service';
import { PLATFORM_STAFF_WHERE } from '../common/platform-staff';
import { NotificationCategory } from './notifications.constants';
import { attendingUserIds } from '../common/attendance';
import {
  CreateOrganiserAnnouncementDto,
  CreatePushBroadcastDto,
  PushTestDto,
} from './dto/push-campaign.dto';

interface TargetSegment {
  type: 'all' | 'event' | 'space' | 'users' | 'staff';
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

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

@Injectable()
export class PushCampaignService {
  private readonly logger = new Logger(PushCampaignService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly events: EventsService,
    private readonly oneSignal: OneSignalService,
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
      void this.dispatch(campaign.id).catch((err) =>
        this.logger.error(`dispatch(${campaign.id}) failed: ${err instanceof Error ? err.message : String(err)}`),
      );
    }
    return campaign;
  }

  /**
   * How many people a broadcast would reach right now, for the confirm step:
   * the same recipients and pref filter `dispatch` uses. An all-users,
   * opt-out broadcast goes to the OneSignal segment, which can also reach
   * signed-out devices, so for that one this is the floor. A staff test sends
   * as `adminAlerts` (see dispatch), so it counts that way too.
   */
  async countAudience(
    target: TargetSegment,
    category: NotificationCategory = 'productUpdates',
  ): Promise<{ recipientCount: number }> {
    const userIds = await this.resolveSegment(target);
    const sendAs: NotificationCategory = target.type === 'staff' ? 'adminAlerts' : category;
    return { recipientCount: await this.notifications.countAllowed(userIds, sendAs) };
  }

  /**
   * Send a draft to the admin's own devices only. Uses the staff category so
   * their own marketing prefs can't swallow it, and stays out of the feed.
   */
  async sendTest(adminId: string, dto: PushTestDto) {
    return this.notifications.send([adminId], {
      category: 'adminAlerts',
      title: `[Test] ${dto.title}`,
      body: dto.body,
      deepLink: dto.deepLink,
      inbox: false,
    });
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
    void this.dispatch(id).catch((err) =>
      this.logger.error(`dispatch(${id}) failed: ${err instanceof Error ? err.message : String(err)}`),
    );
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

  /**
   * Remove a campaign from the history, with its per-user delivery logs
   * (push_logs cascade). Anything but one mid-send: a pending campaign is
   * simply never sent. What phones already received can't be recalled.
   */
  async remove(id: string): Promise<{ success: true }> {
    const res = await this.prisma.pushCampaign.deleteMany({
      where: { id, status: { not: PushCampaignStatus.SENDING } },
    });
    if (res.count !== 1) {
      const exists = await this.prisma.pushCampaign.count({ where: { id } });
      throw exists
        ? new BadRequestException('This broadcast is sending right now; delete it once it finishes')
        : new NotFoundException('Campaign not found');
    }
    return { success: true };
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
    // Stored numbers now; fresher ones land for the next view.
    void this.refreshSegmentStats(items).catch((err) =>
      this.logger.warn(`Segment stats refresh failed: ${err instanceof Error ? err.message : String(err)}`),
    );
    return { items, total, page, limit };
  }

  // ponytail: per-process memory; with several backend replicas each reads at most once per 5 min.
  private readonly statsReadAt = new Map<string, number>();

  /**
   * Segment broadcasts learn their sent/failed counts from OneSignal after the
   * fact (its create response has none). Re-read while the numbers can still
   * move (first day) or were never filled, at most once per 5 minutes per row,
   * and never past 30 days (OneSignal stops answering for old notifications).
   */
  async refreshSegmentStats(items: PushCampaign[]): Promise<void> {
    const now = Date.now();
    const due = items.filter((c) => {
      const sentAt = c.sentAt?.getTime() ?? 0;
      const lastRead = Math.max(this.statsReadAt.get(c.id) ?? 0, c.updatedAt.getTime());
      return (
        c.oneSignalId &&
        c.status === PushCampaignStatus.SENT &&
        sentAt > now - 30 * DAY &&
        lastRead < now - 5 * MINUTE &&
        (sentAt > now - DAY || (c.sentCount === 0 && c.failedCount === 0))
      );
    });
    await Promise.all(
      due.map(async (c) => {
        this.statsReadAt.set(c.id, now);
        const stats = await this.oneSignal.getDeliveryStats(c.oneSignalId!);
        if (!stats) return;
        const sentCount = stats.successful;
        const failedCount = stats.failed + stats.errored;
        if (sentCount === c.sentCount && failedCount === c.failedCount) return;
        await this.prisma.pushCampaign.update({ where: { id: c.id }, data: { sentCount, failedCount } });
      }),
    );
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

    // Scoped auth: only a Space Admin of this event's space (or a co-host).
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
    void this.dispatch(campaign.id).catch((err) =>
      this.logger.error(`dispatch(${campaign.id}) failed: ${err instanceof Error ? err.message : String(err)}`),
    );
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

      // Staff-only test run: marked as a test, kept out of the inbox, and sent
      // as a staff alert so the admins' own category prefs can't swallow it.
      const staffTest = segment.type === 'staff';

      let summary: SendSummary & { oneSignalId?: string | null };
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
          category: staffTest ? 'adminAlerts' : category,
          title: staffTest ? `[Test] ${campaign.title}` : campaign.title,
          body: campaign.body,
          data,
          deepLink,
          campaignId: campaign.id,
          ...(staffTest ? { inbox: false as const } : {}),
        });
      }

      // A segment send OneSignal didn't accept (no id) reached nobody.
      const rejected = useSegment && !summary.oneSignalId;
      await this.prisma.pushCampaign.update({
        where: { id: campaignId },
        data: {
          status: rejected ? PushCampaignStatus.FAILED : PushCampaignStatus.SENT,
          sentAt: rejected ? null : new Date(),
          sentCount: summary.sent,
          failedCount: summary.failed,
          oneSignalId: summary.oneSignalId ?? null,
        },
      });
      this.logger.log(
        `Campaign ${campaignId} ${rejected ? 'rejected by OneSignal' : 'sent'} (${useSegment ? `segment:${BROADCAST_SEGMENT}` : 'external_id'}): ` +
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
    if (campaign.scope === PushScope.EVENT || segment.type === 'event') {
      return this.resolveSegment({ type: 'event', eventId: campaign.eventId ?? segment.eventId });
    }
    return this.resolveSegment(segment);
  }

  private async resolveSegment(segment: TargetSegment): Promise<string[]> {
    if (segment.type === 'event') {
      const eventId = segment.eventId;
      if (!eventId) return [];
      // Leads plus group members who joined: GroupSeat is the roster.
      return attendingUserIds(this.prisma, eventId);
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

    if (segment.type === 'staff') {
      const staff = await this.prisma.user.findMany({ where: PLATFORM_STAFF_WHERE, select: { id: true } });
      return staff.map((u) => u.id);
    }

    // type 'all' — every user (pref opt-out enforced in NotificationsService.send).
    const users = await this.prisma.user.findMany({ select: { id: true } });
    return users.map((u) => u.id);
  }
}
