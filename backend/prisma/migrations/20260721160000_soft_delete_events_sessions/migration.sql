-- Soft delete for events and sessions: hide without destroying. A non-null
-- `deleted_at` removes the row from every organiser and attendee surface while
-- its registrations, tickets, payments and payouts stay intact.

-- AlterTable
ALTER TABLE "events"
    ADD COLUMN "deleted_at" TIMESTAMPTZ(6),
    ADD COLUMN "deleted_by" UUID;

-- AlterTable
ALTER TABLE "sessions"
    ADD COLUMN "deleted_at" TIMESTAMPTZ(6),
    ADD COLUMN "deleted_by" UUID;

-- CreateIndex
CREATE INDEX "events_deleted_at_idx" ON "events"("deleted_at");

-- CreateIndex
CREATE INDEX "sessions_deleted_at_idx" ON "sessions"("deleted_at");
