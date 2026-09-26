-- Event calendar P2: recurrence engine (Model A — an occurrence IS an events row).
--
-- `is_recurring` / `recurring_rule` already exist (previously dead columns) and
-- are repurposed in code: is_recurring=true marks a non-registerable series
-- parent template, recurring_rule holds its RFC-5545 RRULE. Only the new
-- series ↔ occurrence relation and its bookkeeping columns need DDL here.

ALTER TABLE "events"
  ADD COLUMN "series_parent_id" UUID,
  ADD COLUMN "series_detached" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "series_generated_until" TIMESTAMPTZ(6);

-- Deleting a parent template leaves its occurrences standing as ordinary events.
ALTER TABLE "events"
  ADD CONSTRAINT "events_series_parent_id_fkey"
  FOREIGN KEY ("series_parent_id") REFERENCES "events"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Reconciliation lists occurrences by their parent.
CREATE INDEX "events_series_parent_id_idx" ON "events"("series_parent_id");
