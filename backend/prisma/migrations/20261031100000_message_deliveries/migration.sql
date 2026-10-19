-- C3: one delivery log for every outbound message (push, email, WhatsApp).
CREATE TYPE "message_channel" AS ENUM ('PUSH', 'EMAIL', 'WHATSAPP');
CREATE TYPE "message_delivery_status" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'FAILED', 'SKIPPED', 'SUPPRESSED');

CREATE TABLE "message_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel" "message_channel" NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "kind" VARCHAR(64),
    "label" VARCHAR(255) NOT NULL,
    "recipient" VARCHAR(320) NOT NULL,
    "user_id" UUID,
    "status" "message_delivery_status" NOT NULL,
    "provider_message_id" VARCHAR(255),
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "dedup_key" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "delivered_at" TIMESTAMPTZ(6),
    "opened_at" TIMESTAMPTZ(6),

    CONSTRAINT "message_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "message_deliveries_dedup_key_key" ON "message_deliveries"("dedup_key");
CREATE INDEX "message_deliveries_user_id_created_at_idx" ON "message_deliveries"("user_id", "created_at" DESC);
CREATE INDEX "message_deliveries_recipient_created_at_idx" ON "message_deliveries"("recipient", "created_at" DESC);
CREATE INDEX "message_deliveries_provider_message_id_idx" ON "message_deliveries"("provider_message_id");
CREATE INDEX "message_deliveries_status_created_at_idx" ON "message_deliveries"("status", "created_at");
CREATE INDEX "message_deliveries_created_at_idx" ON "message_deliveries"("created_at");
