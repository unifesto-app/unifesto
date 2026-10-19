-- C4: per-category email switches + quiet hours (IST minutes) on notification_settings.
ALTER TABLE "notification_settings"
  ADD COLUMN "email_event_reminders" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "email_new_events" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "quiet_hours_start" SMALLINT,
  ADD COLUMN "quiet_hours_end" SMALLINT;
