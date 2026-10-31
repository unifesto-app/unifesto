/*
 * J6 restore drill: print what a database holds, read-only, so a restored copy
 * can be compared with production line by line.
 *
 * On the server (the image ships dist/ with this script):
 *   docker compose run --rm --no-deps -e RUN_MIGRATIONS=false \
 *     -e DATABASE_URL='postgresql://…@<drill-endpoint>:5432/<db>?sslmode=require' \
 *     backend node dist/scripts/restore-check.js
 * Without the DATABASE_URL override it reads production's own database.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// Money and the tables people would miss first after a bad restore.
const TABLES = [
  'users',
  'spaces',
  'events',
  'event_registrations',
  'event_tickets',
  'group_seat_purchases',
  'session_registrations',
  'payouts',
  'refund_requests',
  'support_tickets',
];

async function main() {
  const prisma = new PrismaClient();
  try {
    const [m] = await prisma.$queryRawUnsafe<{ n: bigint; last: string }[]>(
      `SELECT count(*) AS n, max(migration_name) AS last FROM _prisma_migrations WHERE finished_at IS NOT NULL`,
    );
    console.log(`host        ${new URL(process.env.DATABASE_URL ?? 'postgresql://unknown').host}`);
    console.log(`migrations  ${m.n} applied, last ${m.last}`);
    for (const t of TABLES) {
      // Most tables stamp created_at; registration tables stamp registered_at.
      const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = $1 AND column_name IN ('created_at', 'registered_at')`,
        t,
      );
      const stamp = cols.some((c) => c.column_name === 'created_at') ? 'created_at' : cols[0]?.column_name;
      const [r] = await prisma.$queryRawUnsafe<{ n: bigint; latest: Date | null }[]>(
        `SELECT count(*) AS n, ${stamp ? `max("${stamp}")` : 'NULL'} AS latest FROM "${t}"`,
      );
      console.log(`${t.padEnd(22)} ${String(r.n).padStart(8)}  latest ${r.latest?.toISOString() ?? '-'}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
