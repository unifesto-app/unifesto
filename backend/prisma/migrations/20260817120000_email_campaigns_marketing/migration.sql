-- Email templates & marketing campaigns for Space + Platform.
--
-- Extends the existing platform-only campaign engine into a shared, space-aware
-- one:
--   * email_templates            — reusable bodies (GLOBAL library + per-space).
--   * email_campaigns.space_id   — scopes a campaign to one space (null = apex).
--   * A/B subject + open/click aggregates on campaigns.
--   * per-recipient open/click tracking on email_campaign_logs.
--
-- Also seeds the new `space:manage-email` capability for SPACE_ADMIN + CURATOR
-- into role_capabilities. This seed is REQUIRED, not cosmetic: CapabilityConfig
-- only falls back to the compiled matrix when a role has ZERO rows, and both
-- roles already have rows — so without these inserts the new action would be
-- silently denied for everyone.

-- CreateEnum
CREATE TYPE "email_template_scope" AS ENUM ('GLOBAL', 'SPACE');

-- CreateTable
CREATE TABLE "email_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scope" "email_template_scope" NOT NULL DEFAULT 'SPACE',
    "space_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(500) NOT NULL,
    "body" TEXT NOT NULL,
    "variables" JSONB,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_templates_space_id_idx" ON "email_templates"("space_id");

-- CreateIndex
CREATE INDEX "email_templates_scope_idx" ON "email_templates"("scope");

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: email_campaigns — space scope, A/B, engagement aggregates
ALTER TABLE "email_campaigns" ADD COLUMN "subject_b" VARCHAR(500);
ALTER TABLE "email_campaigns" ADD COLUMN "ab_split_pct" INTEGER;
ALTER TABLE "email_campaigns" ADD COLUMN "space_id" UUID;
ALTER TABLE "email_campaigns" ADD COLUMN "template_id" UUID;
ALTER TABLE "email_campaigns" ADD COLUMN "open_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "email_campaigns" ADD COLUMN "click_count" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "email_campaigns_space_id_idx" ON "email_campaigns"("space_id");

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: email_campaign_logs — per-recipient A/B + engagement tracking
ALTER TABLE "email_campaign_logs" ADD COLUMN "variant" VARCHAR(1);
ALTER TABLE "email_campaign_logs" ADD COLUMN "opened_at" TIMESTAMPTZ(6);
ALTER TABLE "email_campaign_logs" ADD COLUMN "first_clicked_at" TIMESTAMPTZ(6);
ALTER TABLE "email_campaign_logs" ADD COLUMN "open_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "email_campaign_logs" ADD COLUMN "click_count" INTEGER NOT NULL DEFAULT 0;

-- Seed the new capability. Idempotent so re-running is safe. SPACE_ADMIN and
-- CURATOR can compose/send space campaigns and manage space templates.
INSERT INTO "role_capabilities" ("role_code", "action", "updated_at") VALUES
    ('SPACE_ADMIN', 'space:manage-email', CURRENT_TIMESTAMP),
    ('CURATOR', 'space:manage-email', CURRENT_TIMESTAMP)
ON CONFLICT ("role_code", "action") DO NOTHING;
