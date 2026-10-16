-- S42: last gap backfill before the code stops reading `group_members`.
-- Same idempotent INSERT as 20260909120000: any group with a JSON roster and
-- zero seat rows gets one CLAIMED seat per member. A no-op on a clean database.
-- The column itself stays: it still carries the members typed at checkout
-- until payment confirms and seeds the seats. Dropping it is a later
-- contract step once checkout writes seats directly.

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
  -- Confirmed rows only; an unpaid checkout seeds its seats when it confirms.
  AND r."payment_status" IN ('PAID', 'PARTIALLY_REFUNDED')
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
