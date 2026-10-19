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
    source: 'link' | 'one_click' | 'whatsapp_stop' | 'settings';
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

// ── A user's own switches (C4 notification settings) ──────────────────────
// The settings screen reads and writes the same rows the unsubscribe link and
// WhatsApp STOP do, so there is one source of truth per address.

type UserDb = Pick<PrismaClient, 'marketingOptOut' | 'user'>;

/** E.164-ish form WhatsApp STOP rows use (WhatsAppService.formatPhoneNumber). */
function dialForm(mobile: string): string | null {
  const digits = mobile.replace(/\D/g, '');
  if (!digits || /[^\d\s+().-]/.test(mobile)) return null; // closed-account placeholder
  if (!mobile.trim().startsWith('+') && digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

/** The user's addresses per channel: every email on the account, the mobile. */
async function userAddresses(prisma: Pick<UserDb, 'user'>, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mobileNumber: true, identities: { select: { email: true } } },
  });
  const emails = [...new Set((user?.identities ?? []).flatMap((i) => (i.email ? [i.email.trim().toLowerCase()] : [])))];
  const dial = user?.mobileNumber ? dialForm(user.mobileNumber) : null;
  const phones = dial ? [...new Set([dial, user!.mobileNumber.trim()])] : [];
  return { [MarketingChannel.EMAIL]: emails, [MarketingChannel.WHATSAPP]: phones };
}

/** Rows that belong to this user on `channel`: by account, or by address. */
const mine = (userId: string, addresses: string[]): Prisma.MarketingOptOutWhereInput => ({
  OR: [{ userId }, ...(addresses.length ? [{ address: { in: addresses } }] : [])],
});

/**
 * What the settings screen shows: marketing allowed per channel (no global
 * opt-out row), and the spaces whose marketing email they unsubscribed from.
 */
export async function userMarketingPrefs(
  prisma: UserDb,
  userId: string,
): Promise<{ email: boolean; whatsapp: boolean; spaceIds: string[] }> {
  const addresses = await userAddresses(prisma, userId);
  const rows = await prisma.marketingOptOut.findMany({
    where: {
      OR: [
        { channel: MarketingChannel.EMAIL, ...mine(userId, addresses.EMAIL) },
        { channel: MarketingChannel.WHATSAPP, spaceId: null, ...mine(userId, addresses.WHATSAPP) },
      ],
    },
    select: { channel: true, spaceId: true },
  });
  const global = (c: MarketingChannel) => rows.some((r) => r.channel === c && !r.spaceId);
  return {
    email: !global(MarketingChannel.EMAIL),
    whatsapp: !global(MarketingChannel.WHATSAPP),
    spaceIds: [...new Set(rows.flatMap((r) => (r.channel === MarketingChannel.EMAIL && r.spaceId ? [r.spaceId] : [])))],
  };
}

/**
 * The settings switch for all marketing on `channel`. Off = a global opt-out
 * row per address (as if they'd unsubscribed from each); on = drop every
 * global row that's theirs, whoever recorded it (link, STOP, settings).
 */
export async function setUserMarketing(
  prisma: UserDb,
  userId: string,
  channel: MarketingChannel,
  allowed: boolean,
): Promise<void> {
  const addresses = (await userAddresses(prisma, userId))[channel];
  if (allowed) {
    await prisma.marketingOptOut.deleteMany({ where: { channel, spaceId: null, ...mine(userId, addresses) } });
    return;
  }
  // Only the first phone form is recorded; the userId on the row covers the rest.
  for (const address of channel === MarketingChannel.WHATSAPP ? addresses.slice(0, 1) : addresses) {
    await recordMarketingOptOut(prisma, { channel, address, spaceId: null, userId, source: 'settings' });
  }
}

/** Re-subscribe to one space's marketing email. */
export async function resubscribeUserToSpace(prisma: UserDb, userId: string, spaceId: string): Promise<void> {
  const addresses = (await userAddresses(prisma, userId)).EMAIL;
  await prisma.marketingOptOut.deleteMany({
    where: { channel: MarketingChannel.EMAIL, spaceId, ...mine(userId, addresses) },
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
