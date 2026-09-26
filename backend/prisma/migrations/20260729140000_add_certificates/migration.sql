-- Certificate system
--
-- Organiser-designed certificate templates (background image + positioned text
-- fields stored as JSON) and the certificates issued from them. Every issued
-- certificate carries a public, unguessable verification_code and a
-- human-readable certificate_number, and links back to the recipient's account
-- and registration when known. Gated for issuance by the plan flag
-- has_certificates; public verification stays open to everyone.

-- CreateEnum
CREATE TYPE "certificate_audience" AS ENUM ('CHECKED_IN', 'CONFIRMED', 'MANUAL');

-- CreateEnum
CREATE TYPE "certificate_status" AS ENUM ('ISSUED', 'REVOKED');

-- AlterTable
ALTER TABLE "plan_configs" ADD COLUMN "has_certificates" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "billing_model_configs" ADD COLUMN "has_certificates" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: certificates ship on PRO and ENTERPRISE (matching PLAN_LIMITS).
-- No-op if plan_configs is unseeded (the service falls back to PLAN_LIMITS).
UPDATE "plan_configs" SET "has_certificates" = true WHERE "plan" IN ('PRO', 'ENTERPRISE');

-- CreateTable
CREATE TABLE "certificate_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "background_url" TEXT NOT NULL,
    "canvas_width" INTEGER NOT NULL,
    "canvas_height" INTEGER NOT NULL,
    "fields" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "certificate_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "certificate_templates_event_id_idx" ON "certificate_templates"("event_id");

-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "user_id" UUID,
    "registration_id" UUID,
    "recipient_name" VARCHAR(255) NOT NULL,
    "recipient_email" VARCHAR(255),
    "audience" "certificate_audience" NOT NULL,
    "certificate_number" VARCHAR(100) NOT NULL,
    "verification_code" VARCHAR(64) NOT NULL,
    "pdf_url" TEXT,
    "image_url" TEXT,
    "status" "certificate_status" NOT NULL DEFAULT 'ISSUED',
    "issued_by" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" TEXT,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificates_certificate_number_key" ON "certificates"("certificate_number");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_verification_code_key" ON "certificates"("verification_code");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_template_id_user_id_key" ON "certificates"("template_id", "user_id");

-- CreateIndex
CREATE INDEX "certificates_event_id_idx" ON "certificates"("event_id");

-- CreateIndex
CREATE INDEX "certificates_user_id_idx" ON "certificates"("user_id");

-- CreateIndex
CREATE INDEX "certificates_verification_code_idx" ON "certificates"("verification_code");

-- CreateIndex
CREATE INDEX "certificates_status_idx" ON "certificates"("status");

-- AddForeignKey
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "certificate_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
