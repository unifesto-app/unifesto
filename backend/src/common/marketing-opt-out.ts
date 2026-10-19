import { createHmac, timingSafeEqual } from 'crypto';
import { MarketingChannel, Prisma, PrismaClient } from '@prisma/client';

/**
 * Accounts marketing may reach: not closed and not waiting out a deletion
 * request. Spread into a `user` where clause.
 */
export const MARKETABLE_USER = {
  deletedAt: null,
  deletionRequestedAt: null,
} satisfies Prisma.UserWhereInput;

type Db = Pick<PrismaClient, 'marketingOptOut' | 'notificationSettings'>;

/**
 * Who unsubscribed on `channel` from all marketing, or from `spaceId`'s.
 * Addresses come back lowercased.
 *
 * ponytail: loads every matching row; the table only holds unsubscribes, so
 * it stays small. Switch to an `address IN (...)` lookup if it ever isn't.
 */
export async function marketingOptOuts(
  prisma: Pick<Db, 'marketingOptOut'>,
  channel: MarketingChannel,
  spaceId: string | null,
): Promise<{ addresses: Set<string>; userIds: Set<string> }> {
  const rows = await prisma.marketingOptOut.findMany({
    where: { channel, OR: [{ spaceId: null }, ...(spaceId ? [{ spaceId }] : [])] },
    select: { address: true, userId: true },
  });
  return {
    addresses: new Set(rows.map((r) => r.address.toLowerCase())),
    userIds: new Set(rows.flatMap((r) => (r.userId ? [r.userId] : []))),
  };
}

/** Record an opt-out once; repeating it is a no-op. */
export async function recordMarketingOptOut(
  prisma: Pick<Db, 'marketingOptOut'>,
  row: {
    channel: MarketingChannel;
    address: string;
    spaceId: string | null;
    userId?: string | null;
    source: 'link' | 'one_click' | 'whatsapp_stop';
  },
): Promise<void> {
  const address = row.address.trim().toLowerCase();
  const exists = await prisma.marketingOptOut.findFirst({
    where: { channel: row.channel, address, spaceId: row.spaceId },
    select: { id: true },
  });
  if (exists) return;
  await prisma.marketingOptOut.create({
    data: {
      channel: row.channel,
      address,
      spaceId: row.spaceId,
      userId: row.userId ?? null,
      source: row.source,
    },
  });
}

/** Users who turned promotions ON (opt-in: no settings row means off). */
export async function promotionsOptedInUserIds(
  prisma: Pick<Db, 'notificationSettings'>,
  userIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await prisma.notificationSettings.findMany({
    where: { userId: { in: userIds }, promotions: true },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

// ── Signed unsubscribe tokens ──────────────────────────────────────────────
// `<base64url(email \n spaceId)>.<hmac>`. Never expires: an old campaign's
// link has to keep working.

const payload = (email: string, spaceId: string | null) =>
  `${email.trim().toLowerCase()}\n${spaceId ?? ''}`;
const mac = (secret: string, data: string) =>
  createHmac('sha256', secret).update(`unsubscribe:${data}`).digest('base64url');

export function signUnsubscribeToken(
  secret: string,
  email: string,
  spaceId: string | null,
): string {
  const data = payload(email, spaceId);
  return `${Buffer.from(data).toString('base64url')}.${mac(secret, data)}`;
}

/** The email + space a token was issued for, or null when it doesn't verify. */
export function verifyUnsubscribeToken(
  secret: string,
  token: string | undefined,
): { email: string; spaceId: string | null } | null {
  const [encoded, sig] = String(token ?? '').split('.');
  if (!encoded || !sig) return null;
  const data = Buffer.from(encoded, 'base64url').toString('utf8');
  const want = Buffer.from(mac(secret, data));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const [email, spaceId] = data.split('\n');
  return email ? { email, spaceId: spaceId || null } : null;
}
