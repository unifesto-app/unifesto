import { Logger } from '@nestjs/common';
import { MarketingChannel, MessageChannel, MessageDeliveryStatus, PrismaClient } from '@prisma/client';
import { marketingOptOuts, promotionsOptedInUserIds } from '../common/marketing-opt-out';
import { emailOptedOutUserIds } from '../email/email-preferences';
import { DeliveryProvider, logDeliveries } from './message-delivery';
import { NOTIFY_KINDS } from './notify.kinds';
import type { NotificationCategory } from './notifications.constants';
import { istDayStart } from './quiet-hours';

/**
 * The one send check (C16). Every optional message asks canSend() before it
 * goes, on any channel: the person's switches (NotificationSettings), their
 * unsubscribes (MarketingOptOut, campaigns only) and the daily cap on
 * non-critical messages. The tables stay as they are; this is the one place
 * that reads them together.
 *
 * Not asked: sign-in codes, receipts, tickets and the welcome email (they
 * always go). Suppressed addresses are dropped by EmailService for all mail.
 */

export type SendChannel = 'push' | 'email' | 'whatsapp';

export interface SendCheck {
  /** The kind the send logs on message_deliveries. The cap counts by it. */
  kind: string;
  category: NotificationCategory;
  channel: SendChannel;
  /** A critical notify() kind: email ignores the opt-out, and the cap never applies. Push still needs push on. */
  critical?: boolean;
  /** A campaign or broadcast: the unsubscribes apply (from all marketing, or from this space's). */
  marketing?: { spaceId: string | null };
  /** User → the address it goes to. Unsubscribe links know only the address. */
  addresses?: Map<string, string>;
  /** Log the capped as SKIPPED (the real send, not a count preview). */
  log?: { provider: DeliveryProvider; label: string };
}

export interface SendDecision {
  allowed: Set<string>;
  /** Over today's cap (and so not in `allowed`). */
  capped: Set<string>;
}

// ── The daily cap ─────────────────────────────────────────────────────────

/** Most capped messages one person gets in an IST day, every channel together. */
export const DAILY_CAP = 5;

/**
 * Whether a send kind counts toward the cap and is held by it.
 * TODO(owner): the cap number above and these exemptions are the product call.
 */
function countsTowardCap(kind: string, m: KindInfo): boolean {
  if (m.critical) return false;
  if (m.marketing) return true;
  return !['registrationUpdates', 'organiserAnnouncements', 'support', 'adminAlerts'].includes(m.category);
}

interface KindInfo {
  category: NotificationCategory;
  critical?: boolean;
  marketing?: boolean;
}

/** Every category: a push sent without a kind logs its category as the kind. */
const CATEGORIES: Record<NotificationCategory, true> = {
  registrationUpdates: true,
  eventReminders: true,
  newEvents: true,
  spaceUpdates: true,
  promotions: true,
  productUpdates: true,
  organiserAnnouncements: true,
  adminAlerts: true,
  support: true,
};

/**
 * Every kind a cappable send logs, and what it is. A send whose kind isn't
 * here is never capped and never counted.
 */
const SEND_KINDS: Record<string, KindInfo> = {
  ...Object.fromEntries((Object.keys(CATEGORIES) as NotificationCategory[]).map((c) => [c, { category: c }])),
  ...Object.fromEntries(
    Object.entries(NOTIFY_KINDS).map(([k, d]) => [k, { category: d.category, critical: d.criticality === 'critical' }]),
  ),
  'event.published': { category: 'newEvents' },
  'event.reminder': { category: 'eventReminders' },
  'event.starting_soon': { category: 'eventReminders' },
  'event.summary': { category: 'eventReminders' },
  campaign: { category: 'promotions', marketing: true },
  broadcast: { category: 'promotions', marketing: true },
};

export const CAPPED_KINDS: ReadonlySet<string> = new Set(
  Object.entries(SEND_KINDS)
    .filter(([kind, m]) => countsTowardCap(kind, m))
    .map(([kind]) => kind),
);

// QUEUED is left out: a dedup claim is the message being decided right now.
const COUNTED: MessageDeliveryStatus[] = [
  MessageDeliveryStatus.SENT,
  MessageDeliveryStatus.DELIVERED,
  MessageDeliveryStatus.OPENED,
];

// ── Push switches ─────────────────────────────────────────────────────────

// Opt-IN: off until the person turns it on (no settings row = off). Every
// other category is on by default. Mirrors the Prisma schema @default values.
export const OPT_IN_CATEGORIES: ReadonlySet<NotificationCategory> = new Set(['promotions']);

// No NotificationSettings column: only `pushEnabled` applies. Staff alerts, and
// support replies the person is waiting on.
const NO_COLUMN_CATEGORIES: ReadonlySet<NotificationCategory> = new Set(['adminAlerts', 'support']);

function pushAllowed(settings: { pushEnabled: boolean; [k: string]: unknown } | undefined, category: NotificationCategory): boolean {
  if (!settings) return !OPT_IN_CATEGORIES.has(category);
  if (!settings.pushEnabled) return false;
  if (NO_COLUMN_CATEGORIES.has(category)) return true;
  return !!settings[category];
}

// ── The check ─────────────────────────────────────────────────────────────

type Db = Pick<PrismaClient, 'notificationSettings' | 'marketingOptOut' | 'messageDelivery'>;

const logger = new Logger('SendPolicy');

const CHANNEL: Record<SendChannel, MessageChannel> = {
  push: MessageChannel.PUSH,
  email: MessageChannel.EMAIL,
  whatsapp: MessageChannel.WHATSAPP,
};

/**
 * Who of `userIds` may get this message now. A switch lookup that fails
 * throws (the caller's own error handling applies); a cap lookup that fails
 * lets everyone through.
 */
export async function canSend(db: Db, userIds: string[], check: SendCheck): Promise<SendDecision> {
  const ids = [...new Set(userIds)].filter(Boolean);
  const allowed = await allowedBySwitches(db, ids, check);
  const capped = await overCap(db, [...allowed], check.kind);
  for (const id of capped) allowed.delete(id);
  if (capped.size && check.log) {
    await logDeliveries(
      db,
      [...capped].map((userId) => ({
        channel: CHANNEL[check.channel],
        provider: check.log!.provider,
        kind: check.kind.slice(0, 64),
        label: check.log!.label.slice(0, 255),
        recipient: check.addresses?.get(userId) ?? userId,
        userId,
        status: MessageDeliveryStatus.SKIPPED,
        error: 'daily cap',
      })),
    );
  }
  return { allowed, capped };
}

async function allowedBySwitches(db: Db, ids: string[], check: SendCheck): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { category, channel } = check;
  if (channel === 'push') {
    const rows = await db.notificationSettings.findMany({ where: { userId: { in: ids } } });
    const byUser = new Map(rows.map((r) => [r.userId, r]));
    return new Set(ids.filter((id) => pushAllowed(byUser.get(id), category)));
  }
  const [emailOff, optedIn, unsubscribed] = await Promise.all([
    channel === 'email' && !check.critical ? emailOptedOutUserIds(db, ids, category) : null,
    OPT_IN_CATEGORIES.has(category) ? promotionsOptedInUserIds(db, ids) : null,
    check.marketing
      ? marketingOptOuts(db, channel === 'email' ? MarketingChannel.EMAIL : MarketingChannel.WHATSAPP, check.marketing.spaceId)
      : null,
  ]);
  return new Set(
    ids.filter(
      (id) =>
        !emailOff?.has(id) &&
        (!optedIn || optedIn.has(id)) &&
        !(unsubscribed && (unsubscribed.userIds.has(id) || unsubscribed.addresses.has(check.addresses?.get(id)?.toLowerCase() ?? ''))),
    ),
  );
}

/** Of `ids`, those already at the cap today. */
async function overCap(db: Db, ids: string[], kind: string): Promise<Set<string>> {
  if (ids.length === 0 || !CAPPED_KINDS.has(kind)) return new Set();
  try {
    // ponytail: two sends racing for the same person can both pass at the
    // cap's edge (one over). A per-person lock if that ever matters.
    const rows = await db.messageDelivery.groupBy({
      by: ['userId'],
      where: {
        userId: { in: ids },
        kind: { in: [...CAPPED_KINDS] },
        status: { in: COUNTED },
        createdAt: { gte: istDayStart(new Date()) },
      },
      _count: { _all: true },
    });
    return new Set(rows.flatMap((r) => (r.userId && r._count._all >= DAILY_CAP ? [r.userId] : [])));
  } catch (err) {
    logger.warn(`daily cap lookup failed, sending: ${err instanceof Error ? err.message : String(err)}`);
    return new Set();
  }
}
