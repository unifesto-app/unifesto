-- M3: AI-written post-event summary on a report (nullable, additive).
ALTER TABLE "event_reports" ADD COLUMN "ai_summary" TEXT;
ALTER TABLE "event_reports" ADD COLUMN "ai_summary_at" TIMESTAMPTZ(6);
