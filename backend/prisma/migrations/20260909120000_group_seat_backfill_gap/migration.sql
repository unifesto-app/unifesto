-- Group-roster consolidation (Phase 0 — expand / safety backfill).
--
-- Migration 20260802140000_group_seats backfilled `group_seats` from the
-- `group_members` JSON once. Groups created AFTER that migration through a path
-- that never seeded seats — notably free group RSVPs via `completeRSVP`, and
-- waitlist rows that were cancelled before ever paying — still carry a
-- `group_members` array with ZERO seat rows.
--
-- Phase 1 makes `GroupSeat` the single source of truth for the roster (the mobile
-- roster screen, per-member ticket emails, and certificate recipients all move to
-- reading seats). Those readers must not miss a group, so we close the gap here:
-- every group that has a JSON roster but no seats gets one CLAIMED seat per member
-- (seat_index is 1-based ordinality), exactly like the original backfill.
--
-- Idempotent + additive: guarded by `NOT EXISTS (... group_seats ...)`, so it only
-- touches groups with no seats and is safe to re-run. The `group_members` column
-- is intentionally LEFT IN PLACE — it is dropped in a later contract migration once
-- Phase-1 code has baked in production.

INSERT INTO "group_seats" (
  "id", "registration_id", "seat_index", "status", "member_details",
  "invite_token", "claimed_at", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  r."id",
  elem.ord::int,
  'CLAIMED'::"group_seat_status",
  elem.value,
  md5(random()::text || clock_timestamp()::text || r."id"::text || elem.ord::text)
    || md5(random()::text || r."id"::text || elem.ord::text),
  now(),
  now(),
  now()
FROM "event_registrations" r
CROSS JOIN LATERAL jsonb_array_elements(r."group_members") WITH ORDINALITY AS elem(value, ord)
WHERE r."group_members" IS NOT NULL
  AND jsonb_typeof(r."group_members") = 'array'
  AND jsonb_array_length(r."group_members") > 0
  AND NOT EXISTS (
    SELECT 1 FROM "group_seats" gs WHERE gs."registration_id" = r."id"
  );

-- Repoint any group check-ins that were recorded against these newly-seeded
-- registrations but still have no seat link (member_index is 0-based, so
-- seat_index = member_index + 1). No-op for rows already linked.
UPDATE "event_group_member_checkins" c
SET "group_seat_id" = s."id"
FROM "group_seats" s
WHERE c."group_seat_id" IS NULL
  AND s."registration_id" = c."registration_id"
  AND s."seat_index" = c."member_index" + 1;
