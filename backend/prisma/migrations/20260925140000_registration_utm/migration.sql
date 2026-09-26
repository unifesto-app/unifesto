-- Campaign attribution on registrations: the utm_* tags of the link that
-- brought the attendee in. Nullable, so existing rows read as "Direct".
ALTER TABLE "event_registrations"
  ADD COLUMN IF NOT EXISTS "utm_source" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "utm_medium" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "utm_campaign" VARCHAR(100);
