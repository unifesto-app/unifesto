import { Logger } from '@nestjs/common';
import { EmailSuppressionReason, PrismaClient } from '@prisma/client';

/**
 * C5 email suppression list: addresses that hard-bounced, complained, or an
 * admin blocked. EmailService skips them at the transport (except sign-in
 * codes); campaign audiences drop them so counts match what is sent.
 */

type Db = Pick<PrismaClient, 'emailSuppression'>;

const logger = new Logger('EmailSuppression');

/** Notify kinds that go out even to a suppressed address (people must be able to sign in). */
export const SUPPRESSION_EXEMPT_KINDS = new Set(['otp']);

/** The lowercased addresses among `addresses` that are suppressed. Fails open (empty set). */
export async function suppressedAmong(db: Db | undefined, addresses: string[]): Promise<Set<string>> {
  const wanted = [...new Set(addresses.map((a) => a.trim().toLowerCase()).filter(Boolean))];
  if (!db || wanted.length === 0) return new Set();
  try {
    const rows = await db.emailSuppression.findMany({
      where: { address: { in: wanted } },
      select: { address: true },
    });
    return new Set(rows.map((r) => r.address));
  } catch (err) {
    // A lookup problem must not stop mail; the provider still bounces it.
    logger.warn(`suppression lookup failed, sending: ${err instanceof Error ? err.message : String(err)}`);
    return new Set();
  }
}

/** `recipients` minus suppressed addresses (campaign audiences). */
export async function withoutSuppressed<R extends { email: string }>(db: Db | undefined, recipients: R[]): Promise<R[]> {
  const blocked = await suppressedAmong(db, recipients.map((r) => r.email));
  return blocked.size ? recipients.filter((r) => !blocked.has(r.email.trim().toLowerCase())) : recipients;
}

/** Add `address` to the list (first reason wins on repeat). */
export function suppressAddress(
  db: Db,
  address: string,
  reason: EmailSuppressionReason,
  source: string,
  details?: string | null,
) {
  const key = address.trim().toLowerCase();
  return db.emailSuppression.upsert({
    where: { address: key },
    create: { address: key, reason, source, details: details?.slice(0, 2000) ?? null },
    update: {},
  });
}
