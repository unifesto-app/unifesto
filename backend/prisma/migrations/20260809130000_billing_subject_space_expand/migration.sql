-- Spaces platform re-architecture (P0.2) — billing subject: user -> Space.
-- EXPAND phase of an expand/contract rollout: add the space-keyed column and
-- relax the user key, WITHOUT dropping user_id. Existing per-user rows keep
-- working; new rows are space-keyed. P2.2 fans the old rows out to spaces and a
-- later CONTRACT migration drops user_id.

-- 1. New space key (nullable during the transition).
ALTER TABLE "org_subscriptions" ADD COLUMN IF NOT EXISTS "space_id" UUID;

-- 2. Relax the old user key: still unique (legacy rows are one-per-user; new
--    space-keyed rows carry a NULL user_id, and Postgres treats NULLs as
--    distinct), but no longer required.
ALTER TABLE "org_subscriptions" ALTER COLUMN "user_id" DROP NOT NULL;

-- 3. One subscription per space.
CREATE UNIQUE INDEX IF NOT EXISTS "org_subscriptions_space_id_key"
  ON "org_subscriptions"("space_id");

-- 4. FK to spaces; a space's plan dies with the space.
ALTER TABLE "org_subscriptions"
  ADD CONSTRAINT "org_subscriptions_space_id_fkey"
  FOREIGN KEY ("space_id") REFERENCES "spaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
