import { Prisma, PrismaClient } from '@prisma/client';
import type { NotificationCategory } from '../notifications/notifications.constants';

/**
 * The categories that send OPTIONAL mail, and their per-category email switch
 * on NotificationSettings (C4). Any other category's mail is transactional or
 * doesn't exist, so only `emailEnabled` applies to it.
 */
export const EMAIL_CATEGORY_COLUMN = {
  eventReminders: 'emailEventReminders',
  newEvents: 'emailNewEvents',
} as const satisfies Partial<Record<NotificationCategory, keyof Prisma.NotificationSettingsWhereInput>>;

/**
 * Users who switched email off (NotificationSettings.emailEnabled = false),
 * or, given a `category`, that category's email switch. Missing settings row
 * ⇒ email on, so only explicit opt-outs come back.
 *
 * Gate OPTIONAL mail only (reminders, announcements, campaigns, summaries).
 * Transactional mail (OTP, receipts, tickets, refunds, account/security) must
 * never consult this.
 */
export async function emailOptedOutUserIds(
  prisma: Pick<PrismaClient, 'notificationSettings'>,
  userIds: string[],
  category?: NotificationCategory,
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const column = category ? EMAIL_CATEGORY_COLUMN[category as keyof typeof EMAIL_CATEGORY_COLUMN] : undefined;
  const rows = await prisma.notificationSettings.findMany({
    where: {
      userId: { in: userIds },
      OR: [{ emailEnabled: false }, ...(column ? [{ [column]: false }] : [])],
    },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}
