-- C10 + C11: inbox staff tab, segment broadcast stats, staff test audience.

-- C11: OneSignal's create-notification response has no recipient count, so a
-- segment broadcast keeps its notification id and reads sent/failed back.
ALTER TABLE "push_campaigns" ADD COLUMN "onesignal_id" VARCHAR(64);

-- Backfill the four all-users segment broadcasts sent before this (25 and 27
-- Sept IST) with their OneSignal id and final counts, read (read-only) from
-- OneSignal on 19 Oct: successful / failed + errored. Stored outright because
-- the console stops re-reading after 30 days. No match = no-op.
UPDATE "push_campaigns" AS c
SET "onesignal_id" = v.id, "sent_count" = v.sent, "failed_count" = v.failed
FROM (VALUES
  ('Find Events Around you.',      '05088f9e-22a0-478b-879d-03144863f8ae', TIMESTAMPTZ '2026-09-24 20:04:08+00', 1095, 38),
  ('New Event Alert !',            '6b93d14a-fa98-4bb3-96f0-65843e561a29', TIMESTAMPTZ '2026-09-24 20:06:35+00', 1084, 0),
  ('New Version is Available Now', '50d06338-475f-4556-8087-7a5033426823', TIMESTAMPTZ '2026-09-26 19:06:16+00', 1126, 15),
  ('New Version Available',        '909f0853-27ad-4251-b336-a4461fa599a3', TIMESTAMPTZ '2026-09-26 19:07:17+00', 1120, 1)
) AS v(title, id, at, sent, failed)
WHERE c."title" = v.title
  AND c."scope" = 'PLATFORM'
  AND c."target_segment"->>'type' = 'all'
  AND c."onesignal_id" IS NULL
  AND c."sent_count" = 0
  AND c."sent_at" BETWEEN v.at - INTERVAL '10 minutes' AND v.at + INTERVAL '10 minutes';

-- C11: platform-staff-only email audience (test sends).
ALTER TYPE "email_target_type" ADD VALUE IF NOT EXISTS 'STAFF';

-- C10: help-desk queries sent to event staff get their own inbox type, so the
-- app can show them in a Staff tab instead of mixed with personal updates.
UPDATE "user_notifications"
SET "type" = 'help_desk'
WHERE "type" = 'hackathon' AND "deep_link" LIKE '%/help-desk';
