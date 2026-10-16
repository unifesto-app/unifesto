-- contract-step: S42 drops push_log_status 'SKIPPED_MUTE' (chat mute; chat was
-- removed 2026-09-25). Historic rows become SKIPPED_PREF (a skipped send either
-- way), then the enum is rebuilt without the value.
UPDATE "push_logs" SET "status" = 'SKIPPED_PREF' WHERE "status" = 'SKIPPED_MUTE';
CREATE TYPE "push_log_status_new" AS ENUM ('SENT', 'FAILED', 'SKIPPED_PREF');
ALTER TABLE "push_logs" ALTER COLUMN "status" TYPE "push_log_status_new" USING ("status"::text::"push_log_status_new");
ALTER TYPE "push_log_status" RENAME TO "push_log_status_old";
ALTER TYPE "push_log_status_new" RENAME TO "push_log_status";
DROP TYPE "push_log_status_old";
