-- CreateEnum
CREATE TYPE "email_target_type" AS ENUM ('SINGLE_USER', 'SPACE_MEMBERS', 'EVENT_REGISTRANTS', 'ALL_USERS', 'ORGANISERS_ONLY', 'WAITLIST', 'SEGMENT');

-- CreateEnum
CREATE TYPE "email_campaign_status" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "email_log_status" AS ENUM ('SENT', 'FAILED', 'BOUNCED');

-- CreateTable
CREATE TABLE "email_campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subject" VARCHAR(500) NOT NULL,
    "body" TEXT NOT NULL,
    "sent_by" UUID NOT NULL,
    "target_type" "email_target_type" NOT NULL,
    "target_id" UUID,
    "segment_filters" JSONB,
    "total_sent" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "status" "email_campaign_status" NOT NULL DEFAULT 'PENDING',
    "scheduled_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaign_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "recipient_email" VARCHAR(255) NOT NULL,
    "user_id" UUID,
    "status" "email_log_status" NOT NULL,
    "error_message" TEXT,
    "ses_message_id" VARCHAR(255),
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_campaign_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_campaigns_sent_by_idx" ON "email_campaigns"("sent_by");

-- CreateIndex
CREATE INDEX "email_campaigns_target_type_idx" ON "email_campaigns"("target_type");

-- CreateIndex
CREATE INDEX "email_campaigns_status_idx" ON "email_campaigns"("status");

-- CreateIndex
CREATE INDEX "email_campaigns_scheduled_at_idx" ON "email_campaigns"("scheduled_at");

-- CreateIndex
CREATE INDEX "email_campaign_logs_campaign_id_idx" ON "email_campaign_logs"("campaign_id");

-- CreateIndex
CREATE INDEX "email_campaign_logs_user_id_idx" ON "email_campaign_logs"("user_id");

-- CreateIndex
CREATE INDEX "email_campaign_logs_status_idx" ON "email_campaign_logs"("status");

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_logs" ADD CONSTRAINT "email_campaign_logs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
