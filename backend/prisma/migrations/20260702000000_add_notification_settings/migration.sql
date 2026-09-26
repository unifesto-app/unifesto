CREATE TABLE notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  event_reminders BOOLEAN NOT NULL DEFAULT true,
  new_events BOOLEAN NOT NULL DEFAULT true,
  referral_updates BOOLEAN NOT NULL DEFAULT true,
  promotions BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- NOTE: the column-level UNIQUE on user_id above already creates the index
-- `notification_settings_user_id_key`. A redundant `CREATE UNIQUE INDEX
-- notification_settings_user_id_key ...` used to live here and made this
-- migration fail on a fresh replay (42P07: relation already exists), which
-- broke clean rebuilds / CI shadow DBs / DR restores. It was removed. Editing
-- an applied migration is normally avoided, but this file was un-replayable and
-- `prisma migrate deploy` does not re-check checksums of already-applied
-- migrations, so existing prod/staging DBs are unaffected.
