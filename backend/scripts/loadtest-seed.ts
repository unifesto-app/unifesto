/*
 * J6 load test, staging copy only: create N signed-up test users and print
 * access tokens for them (and optionally for one organiser who scans at
 * check-in), so k6 can sign in thousands of virtual users without sending a
 * single OTP. Tokens are minted with this database's own JWT_SECRET, exactly as
 * AuthService.issueTokens does, and expire after 6 hours.
 *
 * On the staging host (--entrypoint node keeps the entrypoint's log lines out
 * of the JSON):
 *   docker compose run --rm --no-deps --entrypoint node backend \
 *     dist/scripts/loadtest-seed.js --staging --count=500 [--scanner=<organiser user id>] \
 *     > tokens.json
 *
 * Refuses production's database. Re-running reuses the same users.
 */
import 'dotenv/config';
import * as jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? 'postgresql://unknown').hostname;
  // Production is the RDS instance `unifesto-db`; a restored copy has its own identifier.
  if (!process.argv.includes('--staging') || host.startsWith('unifesto-db.')) {
    throw new Error(`Refusing to seed ${host}: staging copies only (pass --staging; see loadtest/README.md).`);
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  const count = Math.min(Number(arg('count') ?? 500), 5000);
  const token = (userId: string, tv: number) =>
    jwt.sign({ userId, type: 'access', tv }, secret, { expiresIn: '6h' });

  const prisma = new PrismaClient();
  try {
    const users: { id: string; token: string }[] = [];
    for (let i = 0; i < count; i++) {
      // +999 is not a real country code, so these can never reach a phone.
      const mobileNumber = `+999${String(i).padStart(9, '0')}`;
      const user = await prisma.user.upsert({
        where: { mobileNumber },
        update: {},
        create: { mobileNumber, mobileVerified: true, fullName: `Load Test ${i}` },
        select: { id: true, tokenVersion: true },
      });
      users.push({ id: user.id, token: token(user.id, user.tokenVersion) });
    }
    const scannerId = arg('scanner');
    const scanner = scannerId
      ? await prisma.user.findUniqueOrThrow({ where: { id: scannerId }, select: { id: true, tokenVersion: true } })
      : null;
    process.stdout.write(
      JSON.stringify({ users, scanner: scanner ? token(scanner.id, scanner.tokenVersion) : null }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
