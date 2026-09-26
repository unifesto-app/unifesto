-- Seed the event-scoped JUDGE role for the competitive dashboard.
--
-- Required rows like this belong in a migration, not prisma/seed.ts: the seed
-- runs through ts-node (a devDependency, pruned out of the production image),
-- whereas `prisma migrate deploy` — already in docker-entrypoint.sh — applies
-- this on every deploy and on any fresh database. Idempotent via ON CONFLICT.
INSERT INTO "roles" ("code", "name", "scope")
VALUES ('JUDGE', 'Judge', 'EVENT')
ON CONFLICT ("code") DO NOTHING;
