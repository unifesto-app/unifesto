-- B17: an occurrence's ticket type remembers which series-parent ticket type it
-- copies, so later edits on the parent update it in place (stable ids).
ALTER TABLE "event_ticket_types" ADD COLUMN "source_ticket_type_id" UUID;
CREATE INDEX "event_ticket_types_source_ticket_type_id_idx" ON "event_ticket_types"("source_ticket_type_id");

-- Link existing occurrence tickets to their parent ticket by name.
UPDATE "event_ticket_types" o
SET "source_ticket_type_id" = p."id"
FROM "events" e, "event_ticket_types" p
WHERE o."event_id" = e."id"
  AND e."series_parent_id" IS NOT NULL
  AND p."event_id" = e."series_parent_id"
  AND p."name" = o."name"
  AND o."source_ticket_type_id" IS NULL;
