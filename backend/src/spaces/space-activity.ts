import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, SpaceActivity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { NotificationEvents } from '../notifications/notifications.constants';
import type { NotifyBatchEvent } from '../notifications/notifications.events';
import { SPACE_ADMIN_ROLE_CODES } from '../auth/authorization/role-tiers';
import { PUBLIC_SPACE_STATUSES } from './space-access';

const DAY = 24 * 60 * 60 * 1000;
export const QUIET_DAYS = 60;
// College clubs go quiet over a semester break and the summer; 180 covers both.
export const DORMANT_DAYS = 180;
export const NEW_SPACE_DAYS = 30;

export interface ActivityFacts {
  createdAt: Date;
  lastActivityAt: Date | null;
  hasUpcomingPublished: boolean;
  everPublished: boolean;
}

/**
 * Q38: a live space's activity level. Never written to SpaceStatus.
 * - Active: activity in the last 60 days, or an upcoming published event.
 * - Quiet: 60 to 180 days.
 * - Dormant: 180+ days, or nothing ever published 30 days after creation.
 */
export function activityLevel(f: ActivityFacts, now = new Date()): SpaceActivity {
  if (f.hasUpcomingPublished) return SpaceActivity.ACTIVE;
  if (!f.everPublished) {
    return now.getTime() - f.createdAt.getTime() < NEW_SPACE_DAYS * DAY ? SpaceActivity.ACTIVE : SpaceActivity.DORMANT;
  }
  const idle = now.getTime() - (f.lastActivityAt ?? f.createdAt).getTime();
  if (idle < QUIET_DAYS * DAY) return SpaceActivity.ACTIVE;
  return idle < DORMANT_DAYS * DAY ? SpaceActivity.QUIET : SpaceActivity.DORMANT;
}

/** Explore and search leave Dormant spaces out; their pages, links and tickets keep working. */
export const NOT_DORMANT_WHERE = { activityLevel: { not: SpaceActivity.DORMANT } } satisfies Prisma.SpaceWhereInput;

type Row = {
  id: string;
  name: string;
  created_by: string;
  created_at: Date;
  last_activity_at: Date | null;
  activity_level: SpaceActivity;
  quiet_nudged_at: Date | null;
  latest: Date | null;
  upcoming: boolean;
  ever_published: boolean;
};

@Injectable()
export class SpaceActivityService {
  private readonly logger = new Logger(SpaceActivityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: EventEmitter2,
  ) {}

  @Cron('0 3 * * *', { timeZone: 'Asia/Kolkata' })
  async nightly(): Promise<void> {
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    // Fail closed: a Redis outage skips a night rather than nudging twice.
    await this.redis.runExclusive(
      `cron:spaceActivity:${day}`,
      6 * 60 * 60,
      async () => {
        await this.sweep();
      },
      { failOpen: false },
    );
  }

  /**
   * Recompute every live space's last activity and level, and nudge each newly
   * Quiet space's admins once per Quiet spell.
   * ponytail: one row write per changed space; fine for hundreds of spaces, batch it at tens of thousands.
   */
  async sweep(now = new Date()): Promise<{ updated: number; nudged: number }> {
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT s.id, s.name, s.created_by, s.created_at, s.last_activity_at, s.activity_level, s.quiet_nudged_at,
        GREATEST(
          (SELECT max(GREATEST(e.created_at, e.updated_at, e.published_at)) FROM events e WHERE e.space_id = s.id),
          (SELECT max(GREATEST(r.registered_at, r.checked_in_at))
             FROM event_registrations r JOIN events e ON e.id = r.event_id WHERE e.space_id = s.id)
        ) AS latest,
        EXISTS (SELECT 1 FROM events e WHERE e.space_id = s.id AND e.deleted_at IS NULL
                AND e.status = 'PUBLISHED' AND e.start_date_time > ${now}) AS upcoming,
        EXISTS (SELECT 1 FROM events e WHERE e.space_id = s.id AND e.published_at IS NOT NULL) AS ever_published
      FROM spaces s
      WHERE s.status::text IN (${Prisma.join(PUBLIC_SPACE_STATUSES)})`;

    let updated = 0;
    let nudged = 0;
    for (const r of rows) {
      // Never move the stamp backwards (a publish may have stamped it after the read).
      const last =
        r.latest && (!r.last_activity_at || r.latest > r.last_activity_at) ? r.latest : r.last_activity_at;
      const level = activityLevel(
        { createdAt: r.created_at, lastActivityAt: last, hasUpcomingPublished: r.upcoming, everPublished: r.ever_published },
        now,
      );
      if (level !== r.activity_level || last?.getTime() !== r.last_activity_at?.getTime()) {
        await this.prisma.space.update({ where: { id: r.id }, data: { activityLevel: level, lastActivityAt: last } });
        updated++;
      }
      // One nudge per Quiet spell: activity after the last nudge starts a new spell.
      const newSpell = !r.quiet_nudged_at || (last && last > r.quiet_nudged_at);
      if (level === SpaceActivity.QUIET && newSpell) {
        const { count } = await this.prisma.space.updateMany({
          where: { id: r.id, quietNudgedAt: r.quiet_nudged_at },
          data: { quietNudgedAt: now },
        });
        if (!count) continue;
        nudged++;
        await this.nudge(r, now);
      }
    }
    if (updated || nudged) this.logger.log(`Space activity: ${updated} updated, ${nudged} nudged`);
    return { updated, nudged };
  }

  /** The owner and every Space Admin get one email + push: make the next event. */
  private async nudge(r: Row, now: Date) {
    const admins = await this.prisma.userRole.findMany({
      where: { spaceId: r.id, eventId: null, role: { code: { in: [...SPACE_ADMIN_ROLE_CODES] } } },
      select: { userId: true },
    });
    const userIds = [...new Set([r.created_by, ...admins.map((a) => a.userId)])];
    const batch: NotifyBatchEvent = {
      kind: 'space.quiet',
      items: userIds.map((userId) => ({
        userId,
        data: { spaceId: r.id, spaceName: r.name, nudgedAt: now },
      })),
    };
    this.events.emit(NotificationEvents.NotifyBatch, batch);
  }
}
