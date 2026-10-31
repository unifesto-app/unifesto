/*
 * One-off (J15): move personal files out of the public bucket paths into
 * private/, which the bucket policy keeps out of anonymous GetObject, and point
 * their rows at the new key. The app signs private keys on read from now on.
 *
 *   reports/<id>.pdf          → private/reports/<eventId>/<id>.pdf  (event_reports.file_url)
 *   whatsapp-inbox/…          → private/whatsapp-inbox/…            (whatsapp_messages.media_url)
 *   whatsapp-outbound/…       → private/whatsapp-outbound/…         (whatsapp_messages.media_url)
 *   career-resumes/…          → private/career-resumes/…            (career_applications.resume_url)
 *   sessions/…                → private/sessions/…                  (sessions.recording_url)
 *
 * Every object under those prefixes moves, referenced or not, except a report
 * PDF whose row is gone (the organiser deleted it): that one is deleted. Each
 * object is copied, its rows updated, then the public copy deleted, so a re-run
 * after a partial pass picks up where it stopped.
 *
 * Dry run by default. On the server (the image ships dist/ with this script):
 *   docker compose run --rm --no-deps -e RUN_MIGRATIONS=false backend node dist/scripts/move-private-objects.js
 *   docker compose run --rm --no-deps -e RUN_MIGRATIONS=false backend node dist/scripts/move-private-objects.js --apply
 *
 * Needs AWS_REGION, S3_BUCKET_NAME and DATABASE_URL, plus credentials that can
 * read, write and delete in the bucket (the instance profile on the server).
 */
import 'dotenv/config';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';

const PREFIXES = ['reports/', 'whatsapp-inbox/', 'whatsapp-outbound/', 'career-resumes/', 'sessions/'];

const apply = process.argv.includes('--apply');
const bucket = process.env.S3_BUCKET_NAME;
const region = process.env.AWS_REGION;
if (!bucket || !region) throw new Error('S3_BUCKET_NAME and AWS_REGION are required');
const publicBase = `https://${bucket}.s3.${region}.amazonaws.com/`;

const s3 = new S3Client({ region });
const prisma = new PrismaClient();

/** Where a legacy key goes; null means delete it (a report whose row is gone). */
async function targetFor(key: string): Promise<string | null> {
  if (!key.startsWith('reports/')) return `private/${key}`;
  const id = key.slice('reports/'.length).replace(/\.pdf$/, '');
  const row = /^[0-9a-f-]{36}$/i.test(id)
    ? await prisma.eventReport.findUnique({ where: { id }, select: { eventId: true } })
    : null;
  return row ? `private/reports/${row.eventId}/${id}.pdf` : null;
}

/** Point every row that holds the old public URL at the new private key. */
async function repoint(url: string, key: string): Promise<number> {
  const counts = await Promise.all([
    prisma.eventReport.updateMany({ where: { fileUrl: url }, data: { fileUrl: key } }),
    prisma.whatsappMessage.updateMany({ where: { mediaUrl: url }, data: { mediaUrl: key } }),
    prisma.careerApplication.updateMany({ where: { resumeUrl: url }, data: { resumeUrl: key } }),
    prisma.session.updateMany({ where: { recordingUrl: url }, data: { recordingUrl: key } }),
  ]);
  return counts.reduce((n, c) => n + c.count, 0);
}

async function* objects(prefix: string) {
  let token: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of page.Contents ?? []) if (o.Key) yield o.Key;
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}

async function main() {
  console.log(apply ? 'APPLYING' : 'DRY RUN (pass --apply to move)');
  const totals = { moved: 0, deleted: 0, rows: 0 };
  for (const prefix of PREFIXES) {
    for await (const key of objects(prefix)) {
      const target = await targetFor(key);
      if (!target) {
        console.log(`delete  ${key} (no report row)`);
        if (apply) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        totals.deleted++;
        continue;
      }
      if (apply) {
        await s3.send(
          new CopyObjectCommand({
            Bucket: bucket,
            Key: target,
            CopySource: `${bucket}/${encodeURIComponent(key).replace(/%2F/g, '/')}`,
          }),
        );
      }
      const rows = apply ? await repoint(`${publicBase}${key}`, target) : 0;
      if (apply) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      console.log(`move    ${key} → ${target}${apply ? ` (${rows} row${rows === 1 ? '' : 's'})` : ''}`);
      totals.moved++;
      totals.rows += rows;
    }
  }
  console.log(`${apply ? 'Done' : 'Would do'}: ${totals.moved} moved, ${totals.deleted} deleted${apply ? `, ${totals.rows} rows repointed` : ''}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
