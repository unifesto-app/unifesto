-- Push notifications platform (OneSignal).
--
-- 1. `notification_settings` gains an `organiser_announcements` category switch
--    (default on) so users can opt out of organiser-to-attendee pushes.
-- 2. Three enums + two tables back the send path:
--    - push_campaigns: admin broadcasts + organiser announcements (analog of
--      email_campaigns), with a guarded SCHEDULED->SENDING transition for
--      idempotent scheduled sends.
--    - push_logs: one row per recipient per send (transactional or campaign),
--      recording SENT/FAILED/SKIPPED_PREF/SKIPPED_MUTE. The (campaign, user)
--      uniqueness backstops campaign idempotency.

-- AlterTable: notification_settings
ALTER TABLE "notification_settings"
  ADD COLUMN "organiser_announcements" BOOLEAN NOT NULL DEFAULT true;

-- CreateEnum
CREATE TYPE "push_scope" AS ENUM ('PLATFORM', 'EVENT');
CREATE TYPE "push_campaign_status" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "push_log_status" AS ENUM ('SENT', 'FAILED', 'SKIPPED_PREF', 'SKIPPED_MUTE');

-- CreateTable: push_campaigns
CREATE TABLE "push_campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scope" "push_scope" NOT NULL,
    "event_id" UUID,
    "created_by_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "target_segment" JSONB NOT NULL,
    "status" "push_campaign_status" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "push_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "push_campaigns_status_idx" ON "push_campaigns"("status");
CREATE INDEX "push_campaigns_scope_idx" ON "push_campaigns"("scope");
CREATE INDEX "push_campaigns_event_id_idx" ON "push_campaigns"("event_id");
CREATE INDEX "push_campaigns_created_by_id_idx" ON "push_campaigns"("created_by_id");

-- CreateTable: push_logs
CREATE TABLE "push_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID,
    "user_id" UUID NOT NULL,
    "category" VARCHAR(64) NOT NULL,
    "status" "push_log_status" NOT NULL,
    "one_signal_id" VARCHAR(255),
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_logs_campaign_id_user_id_key" ON "push_logs"("campaign_id", "user_id");
CREATE INDEX "push_logs_user_id_idx" ON "push_logs"("user_id");
CREATE INDEX "push_logs_status_idx" ON "push_logs"("status");
CREATE INDEX "push_logs_category_idx" ON "push_logs"("category");

-- AddForeignKey
ALTER TABLE "push_logs"
  ADD CONSTRAINT "push_logs_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "push_campaigns"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
