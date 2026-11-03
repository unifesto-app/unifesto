-- Q38: space activity levels (Active, Quiet, Dormant). A label, never a status.
-- Additive only. Every space starts ACTIVE; the nightly sweep computes the real
-- level and lastActivityAt from events, registrations and check-ins.
CREATE TYPE "space_activity" AS ENUM ('ACTIVE', 'QUIET', 'DORMANT');

ALTER TABLE "spaces"
  ADD COLUMN "last_activity_at" TIMESTAMPTZ(6),
  ADD COLUMN "activity_level" "space_activity" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "quiet_nudged_at" TIMESTAMPTZ(6);
