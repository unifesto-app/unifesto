import { Logger } from '@nestjs/common';
import { MessageChannel, MessageDeliveryStatus, Prisma, PrismaClient } from '@prisma/client';

/**
 * The per-message delivery log (C3): one `message_deliveries` row per outbound
 * message on every channel, plus in-process retries and dedup.
 *
 * Plain functions over a Prisma client (like email-preferences.ts) so EmailService,
 * WhatsAppService and NotificationsService can all use them without new module
 * imports. Nothing here ever throws into the send path: a logging problem is
 * logged and the message still goes out.
 */

/** What a caller can pass down to a transport send. All optional. */
export interface DeliveryOpts {
  /**
   * Idempotency key. A second send with the same key is skipped (and reported
   * as success) once the first is SENT/DELIVERED/OPENED, or while it is still
   * in flight; it is retried when the first FAILED or was SKIPPED.
   */
  dedupKey?: string;
  /** Notify kind (or push category) for the history view. */
  kind?: string;
  /** The user this message is for, when known (per-user history). */
  userId?: string;
}

export type DeliveryProvider = 'resend' | 'ses' | 'meta' | 'onesignal';

export interface DeliveryMeta extends DeliveryOpts {
  channel: MessageChannel;
  provider: DeliveryProvider;
  /** Email subject, WhatsApp template name or push title. Never a secret. */
  label: string;
  /** Email address, phone, or (push) user id / segment name. */
  recipient: string;
}

/** One provider call's outcome. `retryable` marks transient failures only. */
export interface AttemptResult {
  id: string | null;
  error?: string;
  retryable?: boolean;
}

export interface TrackedResult {
  ok: boolean;
  id: string | null;
  error?: string;
  /** Skipped because the dedupKey was already sent (or is being sent). */
  deduped?: boolean;
}

type Db = Pick<PrismaClient, 'messageDelivery'>;

const logger = new Logger('MessageDelivery');

/**
 * Waits between attempts: 2 extra tries after the first. Exported (mutable) so
 * specs can zero it.
 */
export const RETRY_BACKOFF_MS = [500, 2000];

/** A QUEUED claim older than this is a crashed sender; another may take over. */
const STALE_CLAIM_MS = 10 * 60 * 1000;

const DONE: MessageDeliveryStatus[] = [
  MessageDeliveryStatus.SENT,
  MessageDeliveryStatus.DELIVERED,
  MessageDeliveryStatus.OPENED,
];

/** Transient = worth retrying: no HTTP status (network error, timeout), 429 or 5xx. Never other 4xx. */
export function isTransientStatus(status: number | null | undefined): boolean {
  return status == null || status === 429 || status >= 500;
}

/** For axios errors: transient when there was no response, or a 429/5xx one. */
export function isTransientAxiosError(err: any): boolean {
  return isTransientStatus(err?.response?.status);
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const clip = (s: string | null | undefined, n: number) => (s == null ? s : s.slice(0, n));

/**
 * Run `attempt` up to 1 + RETRY_BACKOFF_MS.length times, retrying only results
 * marked `retryable` (a thrown error counts as retryable). Never throws.
 */
export async function withRetry<R extends AttemptResult>(
  attempt: () => Promise<R>,
): Promise<{ result: R; attempts: number }> {
  let attempts = 0;
  for (;;) {
    attempts++;
    let result: R;
    try {
      result = await attempt();
    } catch (err) {
      // R only adds optional fields (e.g. OneSignal's recipients).
      result = { id: null, error: message(err), retryable: true } as R;
    }
    if (result.id || !result.retryable || attempts > RETRY_BACKOFF_MS.length) {
      return { result, attempts };
    }
    await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempts - 1]));
  }
}

/**
 * Take ownership of `meta.dedupKey` before sending.
 *  - 'claimed': we own the row (now QUEUED); finish it with `finishDelivery(..., true)`.
 *  - 'skip': already sent, or another sender has it in flight; do not send.
 *  - 'untracked': no key, no db, or the db failed; send anyway, log at the end.
 *
 * Insert-first on the unique key, so two racing senders (Razorpay webhook and
 * verifyPayment confirming the same registration) can't both win: the loser
 * gets P2002, then a conditional UPDATE that only re-claims a FAILED/SKIPPED
 * (or stale QUEUED) row. Postgres re-checks that WHERE under the row lock.
 */
export async function claimDelivery(
  db: Db | undefined,
  meta: DeliveryMeta,
): Promise<'claimed' | 'skip' | 'untracked'> {
  if (!db || !meta.dedupKey) return 'untracked';
  try {
    await db.messageDelivery.create({
      data: { ...rowBase(meta), status: MessageDeliveryStatus.QUEUED, dedupKey: meta.dedupKey },
    });
    return 'claimed';
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
      logger.warn(`dedup claim failed for ${meta.dedupKey}, sending untracked: ${message(err)}`);
      return 'untracked';
    }
  }
  try {
    const { count } = await db.messageDelivery.updateMany({
      where: {
        dedupKey: meta.dedupKey,
        OR: [
          { status: { notIn: [...DONE, MessageDeliveryStatus.QUEUED] } },
          { status: MessageDeliveryStatus.QUEUED, updatedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } },
        ],
      },
      data: { status: MessageDeliveryStatus.QUEUED, error: null },
    });
    return count === 1 ? 'claimed' : 'skip';
  } catch (err) {
    // The key exists but we can't read its state: skipping risks losing a
    // message, sending risks a duplicate. A duplicate is the lesser harm.
    logger.warn(`dedup re-claim failed for ${meta.dedupKey}, sending: ${message(err)}`);
    return 'untracked';
  }
}

/** Write the final row: update the claimed one, else insert. Never throws. */
export async function finishDelivery(
  db: Db | undefined,
  meta: DeliveryMeta,
  claimed: boolean,
  status: MessageDeliveryStatus,
  result?: AttemptResult,
  attempts = 0,
): Promise<void> {
  if (!db) return;
  const data = {
    status,
    providerMessageId: clip(result?.id, 255) ?? null,
    error: result?.id ? null : (result?.error ?? null),
    attempts,
  };
  try {
    if (claimed && meta.dedupKey) {
      await db.messageDelivery.update({ where: { dedupKey: meta.dedupKey }, data });
    } else {
      await db.messageDelivery.create({ data: { ...rowBase(meta), ...data } });
    }
  } catch (err) {
    logger.warn(`Failed to write delivery row (${meta.channel} ${meta.recipient}): ${message(err)}`);
  }
}

/** Bulk insert for push fan-out (no dedup). Never throws. */
export async function logDeliveries(db: Db | undefined, rows: Prisma.MessageDeliveryCreateManyInput[]) {
  if (!db || rows.length === 0) return;
  try {
    await db.messageDelivery.createMany({ data: rows });
  } catch (err) {
    logger.warn(`Failed to write ${rows.length} delivery rows: ${message(err)}`);
  }
}

/**
 * The whole C3 path for one message: dedup claim, send with retries, log the
 * outcome. `ok` is true when the provider accepted it or it was deduped.
 * Without a db (unit specs) it just sends with retries. Never throws.
 */
export async function trackedSend(
  db: Db | undefined,
  meta: DeliveryMeta,
  attempt: () => Promise<AttemptResult>,
): Promise<TrackedResult> {
  const claim = await claimDelivery(db, meta);
  if (claim === 'skip') return { ok: true, id: null, deduped: true };
  const { result, attempts } = await withRetry(attempt);
  const status = result.id ? MessageDeliveryStatus.SENT : MessageDeliveryStatus.FAILED;
  await finishDelivery(db, meta, claim === 'claimed', status, result, attempts);
  return { ok: !!result.id, id: result.id, error: result.id ? undefined : result.error };
}

function rowBase(meta: DeliveryMeta) {
  return {
    channel: meta.channel,
    provider: meta.provider,
    kind: clip(meta.kind, 64) ?? null,
    label: clip(meta.label, 255) ?? '',
    recipient: clip(meta.recipient, 320) ?? '',
    userId: meta.userId ?? null,
  };
}
