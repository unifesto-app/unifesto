import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Q29 launch migration: spaces waiting for review go live as they are
 * (Unverified), REJECTED rows stay as history, and new rows default to live.
 */
describe('20261127090000_instant_spaces', () => {
  const sql = readFileSync(
    join(__dirname, '../../prisma/migrations/20261127090000_instant_spaces/migration.sql'),
    'utf8',
  )
    .replace(/--.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

  it('moves only PENDING spaces to ACTIVE and never touches verification', () => {
    expect(sql).toContain(`UPDATE "spaces" SET "status" = 'ACTIVE', "approved_at" = COALESCE("approved_at", now()) WHERE "status" = 'PENDING';`);
    expect(sql).not.toMatch(/verified_at|REJECTED/);
  });

  it('makes ACTIVE the default status for new spaces', () => {
    expect(sql).toContain(`ALTER TABLE "spaces" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';`);
  });
});
