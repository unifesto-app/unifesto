/*
 * One-off backfill: shrink images uploaded before StorageService started
 * optimising them, and give them the same immutable Cache-Control header.
 *
 * Objects are rewritten IN PLACE (same key, same Content-Type), so every URL
 * already stored in the DB keeps working — no DB changes. Before an object is
 * overwritten, its original bytes are copied to `_originals/<key>` so the run
 * can be undone (see --restore). Objects that already carry the immutable
 * header are skipped, so the script is safe to re-run after a partial pass.
 *
 * Dry run by default — prints what it would do and the bytes it would save:
 *   npx ts-node scripts/backfill-image-optimization.ts
 * Do it:
 *   npx ts-node scripts/backfill-image-optimization.ts --apply
 * Options:
 *   --prefix=avatars/,events/   only these prefixes (default: DEFAULT_PREFIXES)
 *   --concurrency=4             parallel objects (default 4)
 *   --no-backup                 don't keep _originals/ copies
 *   --restore                   copy every _originals/<key> back over <key>
 *
 * Needs AWS_REGION + S3_BUCKET_NAME (read from backend/.env if present) and
 * credentials that can read/write the bucket (instance profile or env keys).
 */
import 'dotenv/config';
import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  FULL_RES_PREFIXES,
  IMMUTABLE_CACHE_CONTROL,
  optimizeImage,
} from '../src/storage/storage.service';

/** Every prefix StorageService.uploadFile writes images to (minus full-res ones). */
const DEFAULT_PREFIXES = [
  'avatars/',
  'space-logos/',
  'space-banners/',
  'events/',
  'categories/',
  'blog-covers/',
  'chat-media/',
];
const BACKUP_PREFIX = '_originals/';

const EXT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) =>
  args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const APPLY = flag('apply');
const RESTORE = flag('restore');
const BACKUP = !flag('no-backup');
const CONCURRENCY = Math.max(1, Number(option('concurrency') ?? 4));
const PREFIXES = (option('prefix')?.split(',').filter(Boolean) ?? DEFAULT_PREFIXES).filter(
  (p) => !FULL_RES_PREFIXES.includes(p) && !p.startsWith(BACKUP_PREFIX),
);

const bucket = process.env.S3_BUCKET_NAME;
const region = process.env.AWS_REGION;
if (!bucket || !region) {
  console.error('S3_BUCKET_NAME and AWS_REGION must be set.');
  process.exit(1);
}
const s3 = new S3Client({ region });

async function* listKeys(prefix: string): AsyncGenerator<string> {
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const obj of page.Contents ?? []) if (obj.Key) yield obj.Key;
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}

/** Runs `worker` over `items` with at most CONCURRENCY in flight. */
async function pool<T>(items: AsyncIterable<T>, worker: (item: T) => Promise<void>) {
  const running = new Set<Promise<void>>();
  for await (const item of items) {
    const p = worker(item).finally(() => running.delete(p));
    running.add(p);
    if (running.size >= CONCURRENCY) await Promise.race(running);
  }
  await Promise.all(running);
}

const copySource = (key: string) =>
  `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

const kb = (n: number) => `${(n / 1024).toFixed(0)}KB`;

const stats = { seen: 0, optimised: 0, headerOnly: 0, skipped: 0, failed: 0, before: 0, after: 0 };

async function processKey(key: string): Promise<void> {
  stats.seen++;
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (head.CacheControl === IMMUTABLE_CACHE_CONTROL) {
      stats.skipped++;
      return;
    }
    // Some old objects were stored as octet-stream; trust the extension then.
    const ext = key.split('.').pop()?.toLowerCase() ?? '';
    const contentType = head.ContentType?.startsWith('image/')
      ? head.ContentType
      : EXT_TYPES[ext];
    if (!contentType || !Object.values(EXT_TYPES).includes(contentType)) {
      stats.skipped++;
      return;
    }

    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const original = Buffer.from(await obj.Body!.transformToByteArray());
    const optimised = await optimizeImage(original, contentType);
    const smaller = optimised.length < original.length;

    stats.before += original.length;
    stats.after += optimised.length;
    console.log(
      `${smaller ? 'shrink' : 'header'}  ${key}  ${kb(original.length)} → ${kb(optimised.length)}`,
    );
    if (!APPLY) {
      smaller ? stats.optimised++ : stats.headerOnly++;
      return;
    }

    if (BACKUP) {
      await s3.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: `${BACKUP_PREFIX}${key}`,
          CopySource: copySource(key),
        }),
      );
    }

    if (smaller) {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: optimised,
          ContentType: contentType,
          CacheControl: IMMUTABLE_CACHE_CONTROL,
          Metadata: head.Metadata,
        }),
      );
      stats.optimised++;
    } else {
      // Already small: just attach the cache header (self-copy replaces metadata).
      await s3.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: key,
          CopySource: copySource(key),
          MetadataDirective: 'REPLACE',
          ContentType: contentType,
          CacheControl: IMMUTABLE_CACHE_CONTROL,
          Metadata: head.Metadata,
        }),
      );
      stats.headerOnly++;
    }
  } catch (error) {
    stats.failed++;
    console.error(`FAILED  ${key}: ${error}`);
  }
}

async function restoreKey(backupKey: string): Promise<void> {
  const key = backupKey.slice(BACKUP_PREFIX.length);
  console.log(`restore  ${key}`);
  stats.seen++;
  if (!APPLY) return;
  try {
    await s3.send(
      new CopyObjectCommand({ Bucket: bucket, Key: key, CopySource: copySource(backupKey) }),
    );
  } catch (error) {
    stats.failed++;
    console.error(`FAILED  ${key}: ${error}`);
  }
}

async function main() {
  console.log(
    `${APPLY ? 'APPLYING' : 'DRY RUN (pass --apply to write)'} — bucket=${bucket} ` +
      `concurrency=${CONCURRENCY}${RESTORE ? ' mode=restore' : ` backup=${BACKUP}`}`,
  );

  if (RESTORE) {
    for (const prefix of PREFIXES) await pool(listKeys(BACKUP_PREFIX + prefix), restoreKey);
    console.log(`\nRestored ${stats.seen - stats.failed}/${stats.seen} objects.`);
    return;
  }

  for (const prefix of PREFIXES) {
    console.log(`\n== ${prefix}`);
    await pool(listKeys(prefix), processKey);
  }

  const saved = stats.before - stats.after;
  console.log(
    `\nSeen ${stats.seen} · shrunk ${stats.optimised} · header-only ${stats.headerOnly} · ` +
      `skipped ${stats.skipped} · failed ${stats.failed}\n` +
      `Bytes ${kb(stats.before)} → ${kb(stats.after)} (saves ${kb(saved)}, ` +
      `${stats.before ? ((saved / stats.before) * 100).toFixed(0) : 0}%)`,
  );
  if (stats.failed) process.exitCode = 1;
}

void main();
