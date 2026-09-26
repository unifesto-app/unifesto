-- Track when the T-48h "seat still unclaimed" reminder was sent so the cron is idempotent.
ALTER TABLE "group_seats" ADD COLUMN "reminder_sent_at" TIMESTAMPTZ(6);
