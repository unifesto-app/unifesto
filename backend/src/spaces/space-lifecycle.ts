import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrgPlan, PayoutStatus, Prisma, RegistrationStatus, RoleCode, SpaceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { NotificationEvents } from '../notifications/notifications.constants';
import type { NotifyBatchEvent } from '../notifications/notifications.events';
import { OPEN_REFUND_STATUSES } from '../refunds/open-statuses';
import { HOLDS_SEAT_PAYMENT } from '../registrations/registration.util';
import { NOT_DEMO_SPACE } from '../common/demo-data';
import { isSpaceLive } from './space-access';

/**
 * Q39 space lifecycle. Four statuses are written, all human decisions except
 * the abandoned-space archive:
 * - ACTIVE (live). APPROVED is the old name and is never written again.
 * - INACTIVE, shown as "Paused": the owner pauses and resumes it, instantly.
 * - SUSPENDED: Platform only, with a reason. The owner appeals (SpaceStatusRequest).
 * - ARCHIVED: the owner (no open payout or refund), Platform, or the system.
 *   The owner restores an owner- or system-archived space; Platform's needs a request.
 * Activity (Q38) never writes status.
 */
export type OwnerStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export const PLATFORM_STATUSES: SpaceStatus[] = [
  SpaceStatus.ACTIVE,
  SpaceStatus.INACTIVE,
  SpaceStatus.SUSPENDED,
  SpaceStatus.ARCHIVED,
];

/** Every status write: the status plus who (null = system), when and why. */
export function statusChange(status: SpaceStatus, by: string | null, reason?: string | null) {
  return {
    status,
    statusReason: reason?.trim() || null,
    statusChangedAt: new Date(),
    statusChangedBy: by,
    archiveWarnedAt: null,
  } satisfies Prisma.SpaceUpdateManyMutationInput;
}

type StatusFacts = { createdBy: string; statusChangedBy: string | null; statusChangedAt: Date | null };

/** Who made the last change. Both null = a change from before Q39: Platform's. */
export function changedBy(s: StatusFacts): 'owner' | 'platform' | 'system' {
  if (!s.statusChangedBy) return s.statusChangedAt ? 'system' : 'platform';
  return s.statusChangedBy === s.createdBy ? 'owner' : 'platform';
}

const DAY = 24 * 60 * 60 * 1000;
export const ABANDONED_DAYS = 180;
export const WARNING_DAYS = 14;
const SYSTEM_ARCHIVE_REASON = `No events in ${ABANDONED_DAYS} days`;

/**
 * Abandoned: Unverified, never hosted an event (deleted ones count), no paid
 * plan, no sub-spaces, and nobody touched its status since `cutoff`.
 */
export function abandonedWhere(cutoff: Date): Prisma.SpaceWhereInput {
  return {
    ...NOT_DEMO_SPACE,
    status: { in: [SpaceStatus.ACTIVE, SpaceStatus.APPROVED, SpaceStatus.INACTIVE] },
    verifiedAt: null,
    createdAt: { lte: cutoff },
    events: { none: {} },
    childSpaces: { none: {} },
    plan: OrgPlan.STARTER,
    AND: [
      { OR: [{ statusChangedAt: null }, { statusChangedAt: { lte: cutoff } }] },
      { OR: [{ subscription: { is: null } }, { subscription: { is: { amount: 0 } } }] },
    ],
  };
}

@Injectable()
export class SpaceLifecycleService {
  private readonly logger = new Logger(SpaceLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: EventEmitter2,
  ) {}

  /** The status card in the console and app settings. Members and platform admins only. */
  async view(userId: string, spaceId: string) {
    const space = await this.load(spaceId);
    const isOwner = space.createdBy === userId;
    if (!isOwner) {
      const role = await this.prisma.userRole.findFirst({
        where: { userId, OR: [{ spaceId }, { role: { code: RoleCode.ADMIN } }] },
        select: { id: true },
      });
      if (!role) throw new NotFoundException('Space not found');
    }
    const now = new Date();
    const [upcomingTicketsSold, openPayouts, openRefunds, pendingRequest] = await Promise.all([
      this.prisma.eventRegistration.count({
        where: {
          event: { spaceId, deletedAt: null, endDateTime: { gt: now } },
          status: { not: RegistrationStatus.CANCELLED },
          paymentStatus: { in: HOLDS_SEAT_PAYMENT },
          isWaitlisted: false,
        },
      }),
      ...this.openMoney(spaceId),
      this.prisma.spaceStatusRequest.findFirst({
        where: { spaceId, status: 'PENDING' },
        select: { requestedStatus: true, createdAt: true },
      }),
    ]);
    return {
      spaceId,
      status: isSpaceLive(space.status) ? SpaceStatus.ACTIVE : space.status,
      reason: space.statusReason,
      changedAt: space.statusChangedAt,
      changedBy: space.statusChangedAt ? changedBy(space) : null,
      isOwner,
      canRestore: space.status === SpaceStatus.ARCHIVED && changedBy(space) !== 'platform',
      upcomingTicketsSold,
      openPayouts,
      openRefunds,
      pendingRequest,
    };
  }

  /** The owner pauses, resumes, archives or restores their own space. No review. */
  async setByOwner(userId: string, spaceId: string, to: OwnerStatus) {
    const space = await this.load(spaceId);
    if (space.createdBy !== userId) {
      throw new ForbiddenException('Only the space owner can change its status');
    }
    const live = isSpaceLive(space.status);
    if (to === 'INACTIVE' && !live) {
      throw new BadRequestException('Only a live space can be paused');
    }
    if (to === 'ACTIVE') {
      const restorable = space.status === SpaceStatus.ARCHIVED && changedBy(space) !== 'platform';
      if (space.status !== SpaceStatus.INACTIVE && !restorable) {
        throw new BadRequestException(
          live
            ? 'This space is already live'
            : space.status === SpaceStatus.SUSPENDED
              ? 'Unifesto suspended this space. Appeal to bring it back.'
              : 'Unifesto archived this space. Ask Unifesto to restore it.',
        );
      }
    }
    if (to === 'ARCHIVED') {
      if (!live && space.status !== SpaceStatus.INACTIVE) {
        throw new BadRequestException('Only a live or paused space can be archived');
      }
      const [payouts, refunds] = await Promise.all(this.openMoney(spaceId));
      if (payouts || refunds) {
        throw new ConflictException('Settle open payouts and refunds before archiving this space');
      }
    }
    // Claim on the status we checked, so a racing Platform change wins cleanly.
    const { count } = await this.prisma.space.updateMany({
      where: { id: spaceId, status: space.status },
      data: statusChange(to, userId),
    });
    if (!count) throw new ConflictException('This space just changed. Reload and try again.');
    this.logger.log(`Space ${spaceId} set to ${to} by its owner`);
    return this.view(userId, spaceId);
  }

  @Cron('30 3 * * *', { timeZone: 'Asia/Kolkata' })
  async sweepAbandonedSpaces(): Promise<void> {
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    // Fail closed: a Redis outage skips a night rather than mailing owners twice.
    await this.redis.runExclusive(
      `cron:abandonedSpaces:${day}`,
      6 * 60 * 60,
      async () => {
        await this.runAbandonedSweep();
      },
      { failOpen: false },
    );
  }

  /**
   * Warn owners 14 days before an abandoned space turns 180 days, then archive
   * the ones still abandoned once their warning is 14 days old.
   * ponytail: 200 a night each way; a backlog drains over a few nights.
   */
  async runAbandonedSweep(now = new Date()): Promise<{ warned: number; archived: number }> {
    const warnCutoff = new Date(now.getTime() - (ABANDONED_DAYS - WARNING_DAYS) * DAY);
    const archiveCutoff = new Date(now.getTime() - ABANDONED_DAYS * DAY);
    const select = { id: true, name: true, createdBy: true, status: true } as const;
    let warned = 0;
    let archived = 0;

    const toWarn = await this.prisma.space.findMany({
      where: { ...abandonedWhere(warnCutoff), archiveWarnedAt: null },
      select,
      take: 200,
    });
    const archiveOn = new Date(now.getTime() + WARNING_DAYS * DAY);
    const archiveOnText = archiveOn.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    for (const s of toWarn) {
      const { count } = await this.prisma.space.updateMany({
        where: { id: s.id, archiveWarnedAt: null },
        data: { archiveWarnedAt: now },
      });
      if (!count) continue;
      warned++;
      this.tell({
        kind: 'space.archive_warning',
        items: [{ userId: s.createdBy, data: { spaceId: s.id, spaceName: s.name, archiveOnText } }],
      });
    }

    const toArchive = await this.prisma.space.findMany({
      where: { ...abandonedWhere(archiveCutoff), archiveWarnedAt: { lte: new Date(now.getTime() - WARNING_DAYS * DAY) } },
      select,
      take: 200,
    });
    for (const s of toArchive) {
      // Re-check on write: an event made since the read keeps the space.
      const { count } = await this.prisma.space.updateMany({
        where: { ...abandonedWhere(archiveCutoff), id: s.id, status: s.status },
        data: statusChange(SpaceStatus.ARCHIVED, null, SYSTEM_ARCHIVE_REASON),
      });
      if (!count) continue;
      archived++;
      this.tell({
        kind: 'space.status',
        items: [
          {
            userId: s.createdBy,
            data: {
              spaceId: s.id,
              spaceName: s.name,
              status: SpaceStatus.ARCHIVED,
              reason: SYSTEM_ARCHIVE_REASON,
              changedAt: now,
              bySystem: true,
            },
          },
        ],
      });
    }
    if (warned || archived) this.logger.log(`Abandoned spaces: warned ${warned}, archived ${archived}`);
    return { warned, archived };
  }

  private tell(batch: NotifyBatchEvent) {
    this.events.emit(NotificationEvents.NotifyBatch, batch);
  }

  /** Open payouts and refunds on the space's events: [payouts, refunds]. */
  private openMoney(spaceId: string) {
    return [
      this.prisma.payout.count({
        where: { event: { spaceId }, status: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] } },
      }),
      this.prisma.refundRequest.count({
        where: { event: { spaceId }, status: { in: OPEN_REFUND_STATUSES } },
      }),
    ] as const;
  }

  private async load(spaceId: string) {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      select: {
        id: true,
        status: true,
        createdBy: true,
        statusReason: true,
        statusChangedAt: true,
        statusChangedBy: true,
      },
    });
    if (!space) throw new NotFoundException('Space not found');
    return space;
  }
}
