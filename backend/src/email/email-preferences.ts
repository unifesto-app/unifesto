import { PrismaClient } from '@prisma/client';

/**
 * Users who switched email off (NotificationSettings.emailEnabled = false).
 * Missing settings row ⇒ email on, so only explicit opt-outs come back.
 *
 * Gate OPTIONAL mail only (reminders, announcements, campaigns, summaries).
 * Transactional mail (OTP, receipts, tickets, refunds, account/security) must
 * never consult this.
 */
export async function emailOptedOutUserIds(
  prisma: Pick<PrismaClient, 'notificationSettings'>,
  userIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await prisma.notificationSettings.findMany({
    where: { userId: { in: userIds }, emailEnabled: false },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}
