-- C17: one campaign over the channel campaigns (push, email, WhatsApp), and
-- the channel campaign id on each delivery row for per-channel counts.

-- CreateEnum
CREATE TYPE "campaign_scope" AS ENUM ('PLATFORM', 'SPACE', 'EVENT');

-- CreateEnum
CREATE TYPE "campaign_status" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED', 'HELD');

-- AlterTable
ALTER TABLE "message_deliveries" ADD COLUMN     "campaign_id" UUID;

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scope" "campaign_scope" NOT NULL,
    "space_id" UUID,
    "event_id" UUID,
    "created_by_id" UUID NOT NULL,
    "channels" TEXT[],
    "category" VARCHAR(32) NOT NULL,
    "audience" JSONB NOT NULL,
    "content" JSONB NOT NULL,
    "brief" TEXT,
    "status" "campaign_status" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "error" TEXT,
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "in_app_count" INTEGER NOT NULL DEFAULT 0,
    "push_campaign_id" UUID,
    "email_campaign_id" UUID,
    "whatsapp_broadcast_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_push_campaign_id_key" ON "campaigns"("push_campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_email_campaign_id_key" ON "campaigns"("email_campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_whatsapp_broadcast_id_key" ON "campaigns"("whatsapp_broadcast_id");

-- CreateIndex
CREATE INDEX "campaigns_status_scheduled_at_idx" ON "campaigns"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "campaigns_space_id_created_at_idx" ON "campaigns"("space_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "message_deliveries_campaign_id_idx" ON "message_deliveries"("campaign_id");

