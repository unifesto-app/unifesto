import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventStatus, PushCampaignStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PushCampaignService } from './push-campaign.service';
import { NotificationsService } from './notifications.service';
import { attendingUserIds } from '../common/attendance';
import { ticketLink } from './notify.kinds';

@Injectable()
export class PushSchedulerService {
  private readonly logger = new Logger(PushSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly campaigns: PushCampaignService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Fire scheduled campaigns whose time has passed. `dispatch` is idempotent
   * (guarded SCHEDULED→SENDING), so overlapping runs can't double-send.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async sweepScheduledCampaigns(): Promise<void> {
    const due = await this.prisma.pushCampaign.findMany({
      where: {
        status: PushCampaignStatus.SCHEDULED,
        scheduledAt: { lte: new Date() },
      },
      select: { id: true },
      take: 100,
    });
    for (const c of due) {
      await this.campaigns.dispatch(c.id);
    }
    await this.redis.runExclusive('cron:pushStaleSweep', 50, async () => {
      await this.campaigns.sweepStaleSending();
    });
  }

  /**
   * T-24h event reminders. Runs hourly over a 23–25h window; a per-event Redis
   * guard (setNx, 3-day TTL) makes sure each event is reminded exactly once even
   * if a cron run is missed or overlaps. Reminders degrade to "send" if Redis is
   * down (setNx fails open) — a rare duplicate beats a missed reminder.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sendEventReminders(): Promise<void> {
    const now = Date.now();
    const windowStart = new Date(now + 23 * 60 * 60 * 1000);
    const windowEnd = new Date(now + 25 * 60 * 60 * 1000);

    const events = await this.prisma.event.findMany({
      where: {
        status: EventStatus.PUBLISHED,
        deletedAt: null,
        startDateTime: { gte: windowStart, lte: windowEnd },
      },
      select: { id: true, title: true, slug: true },
    });

    for (const event of events) {
      const first = await this.redis.setNx(`push:reminder:${event.id}`, '1', 3 * 24 * 60 * 60);
      if (!first) continue; // already reminded

      const userIds = await attendingUserIds(this.prisma, event.id);
      if (userIds.length === 0) continue;

      await this.notifications.send(userIds, {
        category: 'eventReminders',
        title: `Tomorrow: ${event.title}`,
        body: `${event.title} starts in about 24 hours. See you there!`,
        deepLink: ticketLink(event.id),
        data: { type: 'event_reminder', eventId: event.id },
      });
      this.logger.log(`Sent T-24h reminder for event ${event.id} to ${userIds.length} attendees`);
    }
  }
}
