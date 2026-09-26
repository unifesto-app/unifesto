-- Admin-configurable window (in days) after an event ends during which
-- organisers may still issue certificates and import/add attendees.
ALTER TABLE "platform_config"
  ADD COLUMN "post_event_action_window_days" INTEGER NOT NULL DEFAULT 7;
