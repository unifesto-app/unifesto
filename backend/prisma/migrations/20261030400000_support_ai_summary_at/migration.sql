-- D15: which message the stored AI summary covers.
ALTER TABLE "support_tickets" ADD COLUMN "ai_summary_at" TIMESTAMPTZ(6);
