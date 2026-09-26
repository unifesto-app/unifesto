-- Sponsors & lead generation.
--
-- A reusable, space-level sponsor roster (sponsors) ranked in a per-space tier
-- ladder (sponsor_tiers) and attached to events with per-event overrides
-- (event_sponsors). Two lead streams: attendee -> sponsor (sponsor_leads) and
-- the organiser's own funnel (leads). Sponsor people sign in through the space
-- app's sponsor portal, their access carried by sponsor_users. Gated by the new
-- has_sponsors plan flag.

-- CreateEnum
CREATE TYPE "sponsor_user_status" AS ENUM ('INVITED', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "sponsor_lead_source" AS ENUM ('OPT_IN', 'BOOTH_SCAN', 'MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "lead_source" AS ENUM ('EVENT_INTEREST', 'SPACE_INQUIRY', 'MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "lead_status" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'ARCHIVED');

-- AlterTable: plan flag (see PlanConfig.hasSponsors / BillingModelConfig.hasSponsors)
ALTER TABLE "plan_configs" ADD COLUMN "has_sponsors" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "billing_model_configs" ADD COLUMN "has_sponsors" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: blanket sponsor lead-sharing consent captured at registration
ALTER TABLE "event_registrations" ADD COLUMN "share_contact_with_sponsors" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "sponsor_tiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "space_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "color" VARCHAR(9),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sponsor_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "space_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "logo_url" TEXT,
    "website_url" TEXT,
    "description" TEXT,
    "contact_name" VARCHAR(255),
    "contact_email" VARCHAR(255),
    "contact_phone" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_sponsors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "sponsor_id" UUID NOT NULL,
    "tier_id" UUID,
    "order" INTEGER NOT NULL DEFAULT 0,
    "lead_capture_enabled" BOOLEAN NOT NULL DEFAULT false,
    "override_logo_url" TEXT,
    "override_description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsor_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sponsor_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "sponsor_user_status" NOT NULL DEFAULT 'INVITED',
    "invited_email" VARCHAR(255),
    "invited_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ(6),

    CONSTRAINT "sponsor_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsor_leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_sponsor_id" UUID NOT NULL,
    "registration_id" UUID,
    "name" VARCHAR(255),
    "email" VARCHAR(255),
    "phone" VARCHAR(50),
    "source" "sponsor_lead_source" NOT NULL DEFAULT 'OPT_IN',
    "note" TEXT,
    "captured_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsor_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "space_id" UUID NOT NULL,
    "event_id" UUID,
    "name" VARCHAR(255),
    "email" VARCHAR(255),
    "phone" VARCHAR(50),
    "message" TEXT,
    "source" "lead_source" NOT NULL DEFAULT 'EVENT_INTEREST',
    "status" "lead_status" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sponsor_tiers_space_id_idx" ON "sponsor_tiers"("space_id");

-- CreateIndex
CREATE INDEX "sponsors_space_id_idx" ON "sponsors"("space_id");

-- CreateIndex
CREATE INDEX "event_sponsors_event_id_idx" ON "event_sponsors"("event_id");

-- CreateIndex
CREATE INDEX "event_sponsors_sponsor_id_idx" ON "event_sponsors"("sponsor_id");

-- CreateIndex
CREATE INDEX "event_sponsors_tier_id_idx" ON "event_sponsors"("tier_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_sponsors_event_id_sponsor_id_key" ON "event_sponsors"("event_id", "sponsor_id");

-- CreateIndex
CREATE INDEX "sponsor_users_sponsor_id_idx" ON "sponsor_users"("sponsor_id");

-- CreateIndex
CREATE INDEX "sponsor_users_user_id_idx" ON "sponsor_users"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sponsor_users_sponsor_id_user_id_key" ON "sponsor_users"("sponsor_id", "user_id");

-- CreateIndex
CREATE INDEX "sponsor_leads_event_sponsor_id_idx" ON "sponsor_leads"("event_sponsor_id");

-- CreateIndex
CREATE INDEX "sponsor_leads_registration_id_idx" ON "sponsor_leads"("registration_id");

-- CreateIndex
CREATE UNIQUE INDEX "sponsor_leads_event_sponsor_id_registration_id_key" ON "sponsor_leads"("event_sponsor_id", "registration_id");

-- CreateIndex
CREATE INDEX "leads_space_id_idx" ON "leads"("space_id");

-- CreateIndex
CREATE INDEX "leads_event_id_idx" ON "leads"("event_id");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- AddForeignKey
ALTER TABLE "sponsor_tiers" ADD CONSTRAINT "sponsor_tiers_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_sponsors" ADD CONSTRAINT "event_sponsors_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_sponsors" ADD CONSTRAINT "event_sponsors_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_sponsors" ADD CONSTRAINT "event_sponsors_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "sponsor_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_users" ADD CONSTRAINT "sponsor_users_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_users" ADD CONSTRAINT "sponsor_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_leads" ADD CONSTRAINT "sponsor_leads_event_sponsor_id_fkey" FOREIGN KEY ("event_sponsor_id") REFERENCES "event_sponsors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_leads" ADD CONSTRAINT "sponsor_leads_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the new `space:manage-sponsors` capability for SPACE_ADMIN + CURATOR into
-- role_capabilities. REQUIRED, not cosmetic: CapabilityConfigService treats a
-- role's existing DB rows as authoritative and only falls back to the compiled
-- matrix when a role has zero rows — so without this seed the compiled grant is
-- shadowed and neither role could manage sponsors. Idempotent so re-running is
-- safe.
INSERT INTO "role_capabilities" ("role_code", "action", "updated_at") VALUES
    ('SPACE_ADMIN', 'space:manage-sponsors', CURRENT_TIMESTAMP),
    ('CURATOR', 'space:manage-sponsors', CURRENT_TIMESTAMP)
ON CONFLICT ("role_code", "action") DO NOTHING;
