import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { ERASED_NAME } from '../common/account-deletion';

/**
 * How long each append-only table keeps rows, in days. Override one with
 * RETENTION_DAYS_<TABLE> (e.g. RETENTION_DAYS_PUSH_LOGS=30).
 *
 * page_views outlive the longest traffic window (365d).
 * email_campaign_logs feed the per-campaign A/B tallies; the campaign row
 * keeps its own open/click counters after its logs go.
 */
export const RETENTION: ReadonlyArray<{
  table: string;
  column: string;
  days: number;
}> = [
  // CERT-In Directions (Apr 2022) require at least 180 days of request logs.
  // api_logs samples 2xx GETs, so the complete record is Caddy's access log
  // (Caddyfile, also 180 days); this table is the API-side view of it.
  { table: 'api_logs', column: 'created_at', days: 180 },
  { table: 'page_views', column: 'created_at', days: 400 },
  { table: 'push_logs', column: 'created_at', days: 90 },
  { table: 'user_notifications', column: 'created_at', days: 180 },
  { table: 'email_campaign_logs', column: 'sent_at', days: 365 },
  { table: 'whatsapp_messages', column: 'created_at', days: 365 },
  { table: 'message_deliveries', column: 'created_at', days: 180 },
];

/**
 * I5 (DPDP): how long personal data is kept, in days. The Privacy Policy (I4)
 * quotes these, so change them here and there together. Override one with
 * RETENTION_DAYS_<NAME> (e.g. RETENTION_DAYS_RESUMES=180).
 */
export const PERSONAL_DATA_RETENTION_DAYS = {
  /** Registration and stay-booking answers, after the event ends. */
  REGISTRATION_ANSWERS: 730,
  /** Group members, stay guests and ticket holder names/emails, after the event ends. */
  GUEST_DETAILS: 730,
  /** Organiser and sponsor leads, after capture. */
  LEADS: 730,
  /** Resolved/closed support threads (with attachments), after the last message. */
  CLOSED_SUPPORT_THREADS: 1095,
  /** Job applications and résumé files, after applying. */
  RESUMES: 365,
  /** WhatsApp inbox threads (with media), after the last message. */
  WHATSAPP_THREADS: 365,
} as const;

/**
 * One personal-data sweep. `where` is static SQL with $1 = the cutoff. With
 * `set` the rows are scrubbed in place (registrations and bookings are money
 * records), so `where` must also skip rows already scrubbed; without it they
 * are deleted. `files` returns the S3 keys/prefixes of a deleted row.
 */
type Sweep = {
  name: keyof typeof PERSONAL_DATA_RETENTION_DAYS;
  table: string;
  where: string;
  set?: string;
  returning?: string;
  files?: (row: Record<string, string>) => { keys?: string[]; prefixes?: string[] };
};

const EVENT_ENDED = `SELECT id FROM events WHERE end_date_time < $1`;
const SWEEPS: Sweep[] = [
  {
    name: 'REGISTRATION_ANSWERS',
    table: 'event_registrations',
    where: `form_responses IS NOT NULL AND event_id IN (${EVENT_ENDED})`,
    set: `form_responses = NULL`,
  },
  {
    name: 'REGISTRATION_ANSWERS',
    table: 'stay_bookings',
    where: `(answers IS NOT NULL OR emergency_name IS NOT NULL OR emergency_phone IS NOT NULL OR note IS NOT NULL)
      AND event_id IN (${EVENT_ENDED})`,
    set: `answers = NULL, emergency_name = NULL, emergency_phone = NULL, note = NULL`,
  },
  {
    name: 'GUEST_DETAILS',
    table: 'group_seats',
    where: `(member_details IS NOT NULL OR invite_email IS NOT NULL)
      AND registration_id IN (SELECT id FROM event_registrations WHERE event_id IN (${EVENT_ENDED}))`,
    set: `member_details = NULL, invite_email = NULL`,
  },
  {
    name: 'GUEST_DETAILS',
    table: 'event_tickets',
    where: `(attendee_name IS NOT NULL OR attendee_email IS NOT NULL)
      AND registration_id IN (SELECT id FROM event_registrations WHERE event_id IN (${EVENT_ENDED}))`,
    set: `attendee_name = NULL, attendee_email = NULL`,
  },
  {
    // name/gender are NOT NULL; gender alone keeps bed counts true.
    name: 'GUEST_DETAILS',
    table: 'stay_guests',
    where: `name <> '${ERASED_NAME}'
      AND booking_id IN (SELECT id FROM stay_bookings WHERE event_id IN (${EVENT_ENDED}))`,
    set: `name = '${ERASED_NAME}', phone = NULL, email = NULL, id_proof = NULL`,
  },
  { name: 'LEADS', table: 'leads', where: `created_at < $1` },
  { name: 'LEADS', table: 'sponsor_leads', where: `created_at < $1` },
  {
    // Refund requests keep their row (support_ticket_id is SET NULL).
    name: 'CLOSED_SUPPORT_THREADS',
    table: 'support_tickets',
    where: `status IN ('RESOLVED', 'CLOSED') AND last_message_at < $1`,
    returning: 'id',
    files: (r) => ({ prefixes: [`private/support/${r.id}/`] }),
  },
  {
    // Legacy rows hold a public URL, not a private key: the row goes, the
    // old object is left (none are newer than S25).
    name: 'RESUMES',
    table: 'career_applications',
    where: `created_at < $1`,
    returning: 'resume_url',
    files: (r) => ({ keys: r.resume_url.startsWith('private/career-resumes/') ? [r.resume_url] : [] }),
  },
  {
    name: 'WHATSAPP_THREADS',
    table: 'whatsapp_conversations',
    where: `last_message_at < $1`,
    returning: 'wa_id',
    // private/ since J15; the plain prefixes hold media from before the move.
    files: (r) => ({
      prefixes: ['whatsapp-inbox', 'whatsapp-outbound', 'private/whatsapp-inbox', 'private/whatsapp-outbound'].map(
        (dir) => `${dir}/${r.wa_id}/`,
      ),
    }),
  },
];

/** Rows per DELETE, so no single statement holds locks for long. */
const CHUNK = 5000;
const DAY = 24 * 60 * 60 * 1000;

function days(name: string, fallback: number): number {
  const override = Number(process.env[`RETENTION_DAYS_${name.toUpperCase()}`]);
  return override > 0 ? override : fallback;
}

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
  ) {}

  /** Daily at 04:15 IST, one replica. */
  @Cron('15 4 * * *', { timeZone: 'Asia/Kolkata' })
  async prune(): Promise<void> {
    await this.redis.runExclusive('cron:retention', 60 * 60, async () => {
      await this.pruneAll();
    });
  }

  /**
   * Run every sweep. With `dryRun` nothing changes: each count is how many
   * rows the sweep would delete or scrub now.
   */
  async pruneAll(now = new Date(), { dryRun = false } = {}): Promise<Record<string, number>> {
    const pruned: Record<string, number> = {};
    const sweeps = [
      ...RETENTION.map(({ table, column, days: d }) => ({
        label: table,
        table,
        keep: days(table, d),
        where: `"${column}" < $1`,
      })),
      ...SWEEPS.map((s) => ({ ...s, label: `${s.name}:${s.table}`, keep: days(s.name, PERSONAL_DATA_RETENTION_DAYS[s.name]) })),
    ];
    for (const sweep of sweeps) {
      const cutoff = new Date(now.getTime() - sweep.keep * DAY);
      const total = dryRun ? await this.count(sweep, cutoff) : await this.run(sweep, cutoff);
      pruned[sweep.label] = total;
      if (total > 0) {
        this.logger.log(`${dryRun ? 'Would prune' : 'Pruned'} ${total} ${sweep.label} rows older than ${sweep.keep}d`);
      }
    }
    return pruned;
  }

  // Table/column names and SQL come from the constants above, never from input.
  private async count(sweep: { table: string; where: string }, cutoff: Date): Promise<number> {
    const [row] = await this.prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM "${sweep.table}" WHERE ${sweep.where}`,
      cutoff,
    );
    return Number(row?.n ?? 0);
  }

  private async run(sweep: Omit<Sweep, 'name'>, cutoff: Date): Promise<number> {
    const pick = `ctid IN (SELECT ctid FROM "${sweep.table}" WHERE ${sweep.where} LIMIT ${CHUNK})`;
    let total = 0;
    for (;;) {
      let n: number;
      if (sweep.set) {
        n = await this.prisma.$executeRawUnsafe(`UPDATE "${sweep.table}" SET ${sweep.set} WHERE ${pick}`, cutoff);
      } else if (sweep.returning) {
        const rows = await this.prisma.$queryRawUnsafe<Record<string, string>[]>(
          `DELETE FROM "${sweep.table}" WHERE ${pick} RETURNING ${sweep.returning}`,
          cutoff,
        );
        n = rows.length;
        // Rows first, then files: a failed S3 delete leaves an orphan object
        // (logged by StorageService), never a row pointing at nothing.
        for (const row of rows) {
          const { keys = [], prefixes = [] } = sweep.files?.(row) ?? {};
          for (const key of keys) await this.storage.deleteObject(key);
          for (const prefix of prefixes) {
            await this.storage.deletePrefix(prefix).catch((err) =>
              this.logger.error(`Retention: deleting ${prefix} failed: ${err instanceof Error ? err.message : String(err)}`),
            );
          }
        }
      } else {
        n = await this.prisma.$executeRawUnsafe(`DELETE FROM "${sweep.table}" WHERE ${pick}`, cutoff);
      }
      total += n;
      if (n < CHUNK) break;
    }
    return total;
  }
}
