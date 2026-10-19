import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PAGE = 30;

export interface NotificationScope {
  eventId?: string;
  type?: string;
  /** Everything but this type, e.g. the personal tab without staff help-desk queries. */
  excludeType?: string;
}

/**
 * The signed-in user's in-app notification feed (`user_notifications`). Rows
 * are written by NotificationsService.send (on by default); this only reads them and
 * marks them read. Every query is pinned to the caller's own userId.
 */
@Injectable()
export class UserNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private where(userId: string, scope: NotificationScope): Prisma.UserNotificationWhereInput {
    return {
      userId,
      ...(scope.eventId ? { eventId: scope.eventId } : {}),
      ...(scope.type ? { type: scope.type } : scope.excludeType ? { type: { not: scope.excludeType } } : {}),
    };
  }

  /** Newest first. `nextBefore` is the cursor for the next page, null at the end. */
  async list(userId: string, scope: NotificationScope & { before?: string; limit?: number }) {
    const take = scope.limit ?? DEFAULT_PAGE;
    const rows = await this.prisma.userNotification.findMany({
      where: {
        ...this.where(userId, scope),
        ...(scope.before ? { createdAt: { lt: new Date(scope.before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      select: {
        id: true,
        eventId: true,
        type: true,
        title: true,
        body: true,
        deepLink: true,
        data: true,
        readAt: true,
        createdAt: true,
      },
    });
    const items = rows.slice(0, take);
    return {
      items,
      nextBefore: rows.length > take ? items[items.length - 1].createdAt.toISOString() : null,
    };
  }

  async unreadCount(userId: string, scope: NotificationScope) {
    const count = await this.prisma.userNotification.count({
      where: { ...this.where(userId, scope), readAt: null },
    });
    return { count };
  }

  async markRead(userId: string, scope: NotificationScope & { ids?: string[] }) {
    const res = await this.prisma.userNotification.updateMany({
      where: {
        ...this.where(userId, scope),
        ...(scope.ids?.length ? { id: { in: scope.ids } } : {}),
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { updated: res.count };
  }
}
