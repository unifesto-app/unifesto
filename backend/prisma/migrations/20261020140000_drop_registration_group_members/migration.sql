-- contract-step: S42 retires `event_registrations.group_members`. Checkout,
-- manual-add payment links and waitlist joins create GroupSeat rows with the
-- registration since S42 A, and nothing reads or writes the column.
--
-- Unconfirmed rows from before that deploy (a PENDING/FAILED checkout or a
-- waiting list entry) still carry their typed members only in the JSON. Seed
-- their seats first, the same shape createSeatsForRegistration writes: seats
-- 1..N, seat 1 CLAIMED to the lead, a seat with a typed member CLAIMED with
-- those details, the rest OPEN. Confirmation then finds the seats. Confirmed
-- rows were seeded by 20261020130100. Idempotent (NOT EXISTS).

INSERT INTO "group_seats" (
  "id", "registration_id", "seat_index", "status", "member_details",
  "invite_token", "claimed_by_user_id", "claimed_at", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  s."registration_id",
  s."seat_index",
  CASE WHEN s."seat_index" = 1 OR s."member" IS NOT NULL
    THEN 'CLAIMED' ELSE 'OPEN' END::"group_seat_status",
  s."member",
  md5(random()::text || clock_timestamp()::text || s."registration_id"::text || s."seat_index"::text)
    || md5(random()::text || s."registration_id"::text || s."seat_index"::text),
  CASE WHEN s."seat_index" = 1 THEN s."user_id" END,
  CASE WHEN s."seat_index" = 1 OR s."member" IS NOT NULL THEN now() END,
  now(),
  now()
FROM (
  SELECT
    r."id" AS "registration_id",
    r."user_id",
    i AS "seat_index",
    NULLIF(r."group_members" -> (i - 1), 'null'::jsonb) AS "member"
  FROM "event_registrations" r
  CROSS JOIN LATERAL generate_series(1, COALESCE(r."group_size", r."quantity")) AS i
  WHERE r."group_members" IS NOT NULL
    AND jsonb_typeof(r."group_members") = 'array'
    AND r."payment_status" IN ('PENDING', 'FAILED')
    AND COALESCE(r."group_size", r."quantity") > 1
    AND NOT EXISTS (
      SELECT 1 FROM "group_seats" gs WHERE gs."registration_id" = r."id"
    )
) s;

ALTER TABLE "event_registrations" DROP COLUMN IF EXISTS "group_members";
