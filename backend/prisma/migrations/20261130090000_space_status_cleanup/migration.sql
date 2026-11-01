-- Q39: one name for live. APPROVED stays in the enum for old app builds but is
-- no longer written; existing rows become ACTIVE.
UPDATE "spaces" SET "status" = 'ACTIVE' WHERE "status" = 'APPROVED';

ALTER TABLE "spaces"
  ADD COLUMN "status_reason" TEXT,
  ADD COLUMN "status_changed_at" TIMESTAMPTZ(6),
  ADD COLUMN "status_changed_by" UUID,
  ADD COLUMN "archive_warned_at" TIMESTAMPTZ(6);
