-- Fast-registration Part 2: move group members off the `group_members` JSON blob
-- onto per-seat `group_seats` rows so each seat can be invited + claimed
-- independently.
--
-- Additive + safe: the JSON column stays (read-only) for the transition. Legacy
-- groups are backfilled as CLAIMED seats with no claimer (claimed_by_user_id
-- NULL) — new code must not assume that column is set. We trust the array: a
-- registration whose array length differs from group_size gets one seat per
-- array element (drift is logged by the app, not reconciled here).

-- CreateEnum
CREATE TYPE "group_seat_status" AS ENUM ('OPEN', 'INVITED', 'CLAIMED');

-- CreateTable
CREATE TABLE "group_seats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "registration_id" UUID NOT NULL,
    "seat_index" INTEGER NOT NULL,
    "status" "group_seat_status" NOT NULL DEFAULT 'OPEN',
    "invite_email" VARCHAR(255),
    "invite_token" VARCHAR(64) NOT NULL,
    "claimed_by_user_id" UUID,
    "member_details" JSONB,
    "claimed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "group_seats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_seats_invite_token_key" ON "group_seats"("invite_token");
CREATE UNIQUE INDEX "group_seats_registration_id_seat_index_key" ON "group_seats"("registration_id", "seat_index");
CREATE INDEX "group_seats_invite_token_idx" ON "group_seats"("invite_token");
CREATE INDEX "group_seats_claimed_by_user_id_idx" ON "group_seats"("claimed_by_user_id");

-- AddForeignKey
ALTER TABLE "group_seats"
  ADD CONSTRAINT "group_seats_registration_id_fkey"
  FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_seats"
  ADD CONSTRAINT "group_seats_claimed_by_user_id_fkey"
  FOREIGN KEY ("claimed_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: check-ins point at a seat (kept nullable; member_index retained)
ALTER TABLE "event_group_member_checkins"
  ADD COLUMN "group_seat_id" UUID;
CREATE INDEX "event_group_member_checkins_group_seat_id_idx" ON "event_group_member_checkins"("group_seat_id");
ALTER TABLE "event_group_member_checkins"
  ADD CONSTRAINT "event_group_member_checkins_group_seat_id_fkey"
  FOREIGN KEY ("group_seat_id") REFERENCES "group_seats"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one CLAIMED seat per element of group_members (seat_index is 1-based
-- ordinality). Tokens are unique but inert for legacy seats (already claimed);
-- md5-pair avoids a pgcrypto dependency for gen_random_bytes.
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
  AND jsonb_typeof(r."group_members") = 'array';

-- Repoint existing group check-ins to their seat (member_index is 0-based, so
-- seat_index = member_index + 1).
UPDATE "event_group_member_checkins" c
SET "group_seat_id" = s."id"
FROM "group_seats" s
WHERE s."registration_id" = c."registration_id"
  AND s."seat_index" = c."member_index" + 1;
