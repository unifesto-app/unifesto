-- Event report generation
--
-- Organiser-generated event reports rendered to a formatted PDF and persisted
-- for re-download. A report is a snapshot: `stats` and the stored file freeze
-- the numbers at generation time, so an old report never silently changes as
-- new registrations arrive. Gated by the existing plan flag has_analytics
-- (no new plan column). Two shapes: DEFAULT (every section) and CUSTOM (the
-- organiser-chosen subset held in `sections`).

-- CreateEnum
CREATE TYPE "report_type" AS ENUM ('DEFAULT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "report_section" AS ENUM ('OVERVIEW', 'TICKETS', 'ATTENDEES', 'REVENUE', 'CHECKINS');

-- CreateTable
CREATE TABLE "event_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "type" "report_type" NOT NULL DEFAULT 'DEFAULT',
    "status" "report_status" NOT NULL DEFAULT 'PENDING',
    "title" VARCHAR(200) NOT NULL,
    "sections" "report_section"[],
    "date_from" TIMESTAMPTZ(6),
    "date_to" TIMESTAMPTZ(6),
    "stats" JSONB,
    "file_url" TEXT,
    "file_name" VARCHAR(255),
    "error" TEXT,
    "generated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_reports_event_id_idx" ON "event_reports"("event_id");

-- CreateIndex
CREATE INDEX "event_reports_status_idx" ON "event_reports"("status");

-- AddForeignKey
ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
