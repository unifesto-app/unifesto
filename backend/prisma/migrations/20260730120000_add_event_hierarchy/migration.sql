-- Parent / sub-event hierarchy.
--
-- A "big event" (parent) groups several sub-events under one umbrella — a
-- festival with its hackathon, workshops and keynote. Registration stays
-- per-event: the parent is a hub page listing its sub-events, each keeping its
-- own tickets, capacity and check-in.
--
-- One level deep by design (enforced in the service, not the DB): a sub-event
-- may not itself be a parent, and both ends must belong to the same space.
-- ON DELETE SET NULL so a sub-event outlives its parent — hard-deleting a
-- parent leaves its children standing as ordinary events.

-- AlterTable
ALTER TABLE "events" ADD COLUMN "parent_event_id" UUID;

-- AddForeignKey
ALTER TABLE "events"
  ADD CONSTRAINT "events_parent_event_id_fkey"
  FOREIGN KEY ("parent_event_id") REFERENCES "events"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "events_parent_event_id_idx" ON "events"("parent_event_id");
