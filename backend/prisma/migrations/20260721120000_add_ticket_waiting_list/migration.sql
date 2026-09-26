-- Waiting list, moved from the event to the ticket type (capacity lives on the
-- ticket type, so the queue that guards it must too) and given an exit path:
-- organiser offers a spot, the seat is held, the attendee pays, it converts.

-- CreateEnum
CREATE TYPE "waitlist_status" AS ENUM ('WAITING', 'OFFERED', 'CONVERTED', 'EXPIRED', 'DECLINED');

-- AlterTable
ALTER TABLE "event_ticket_types"
    ADD COLUMN "waitlist_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "waitlist_offer_ttl_hours" INTEGER NOT NULL DEFAULT 24;

-- AlterTable
ALTER TABLE "event_registrations"
    ADD COLUMN "waitlist_status" "waitlist_status",
    ADD COLUMN "waitlisted_at" TIMESTAMPTZ(6),
    ADD COLUMN "waitlist_offered_at" TIMESTAMPTZ(6),
    ADD COLUMN "waitlist_offer_expires_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "event_registrations_ticket_type_id_waitlist_status_waitlis_idx"
    ON "event_registrations"("ticket_type_id", "waitlist_status", "waitlisted_at");

-- CreateIndex
CREATE INDEX "event_registrations_waitlist_status_waitlist_offer_expires_idx"
    ON "event_registrations"("waitlist_status", "waitlist_offer_expires_at");

-- Backfill: carry the event-level opt-in down to every ticket type that has a
-- capacity to run out of. Unlimited ticket types never sell out, so a queue on
-- them would be dead configuration.
UPDATE "event_ticket_types" t
SET "waitlist_enabled" = true
FROM "events" e
WHERE t."event_id" = e."id"
  AND e."waitlist_enabled" = true
  AND t."total_quantity" IS NOT NULL;

-- Backfill: existing waitlisted rows predate the status column. They were only
-- ever queued (nothing could promote them), so they are all WAITING, ordered by
-- when they registered.
UPDATE "event_registrations"
SET "waitlist_status" = 'WAITING',
    "waitlisted_at" = "registered_at"
WHERE "is_waitlisted" = true
  AND "waitlist_status" IS NULL;
