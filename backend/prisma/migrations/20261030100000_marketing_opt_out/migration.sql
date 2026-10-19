-- C8: marketing unsubscribe store + WhatsApp blast audit trail.

CREATE TYPE "marketing_channel" AS ENUM ('EMAIL', 'WHATSAPP');

CREATE TABLE "marketing_opt_outs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel" "marketing_channel" NOT NULL,
    "address" VARCHAR(255) NOT NULL,
    "user_id" UUID,
    "space_id" UUID,
    "source" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_opt_outs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_opt_outs_channel_space_id_idx" ON "marketing_opt_outs"("channel", "space_id");
CREATE INDEX "marketing_opt_outs_address_idx" ON "marketing_opt_outs"("address");
CREATE INDEX "marketing_opt_outs_user_id_idx" ON "marketing_opt_outs"("user_id");

CREATE TABLE "whatsapp_broadcasts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sent_by_id" UUID NOT NULL,
    "template_name" VARCHAR(512) NOT NULL,
    "language_code" VARCHAR(10) NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "audience" VARCHAR(10) NOT NULL,
    "space_id" UUID,
    "user_ids" UUID[],
    "body_params" TEXT[],
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "recipient_count" INTEGER NOT NULL,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "whatsapp_broadcasts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "whatsapp_broadcasts_created_at_idx" ON "whatsapp_broadcasts"("created_at");
