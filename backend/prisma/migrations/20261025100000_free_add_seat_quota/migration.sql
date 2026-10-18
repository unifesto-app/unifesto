-- A27: a free-add approval is a seat quota, not a permanent switch. Every comp
-- of a paid ticket (single add, CSV import, curator add-seats) draws it down;
-- an admin can revoke it. Approvals made before this keep approved_seats NULL,
-- which means unlimited until an admin revokes or replaces them.
ALTER TABLE "free_attendee_add_requests"
  ADD COLUMN "ticket_type_id" UUID,
  ADD COLUMN "requested_seats" INTEGER,
  ADD COLUMN "approved_seats" INTEGER,
  ADD COLUMN "used_seats" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "free_attendee_add_requests"
  ADD CONSTRAINT "free_attendee_add_requests_ticket_type_id_fkey"
  FOREIGN KEY ("ticket_type_id") REFERENCES "event_ticket_types"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Never comp past what was approved.
ALTER TABLE "free_attendee_add_requests"
  ADD CONSTRAINT "free_attendee_add_requests_used_within_approved"
  CHECK ("approved_seats" IS NULL OR "used_seats" <= "approved_seats");

CREATE INDEX "free_attendee_add_requests_event_id_status_idx"
  ON "free_attendee_add_requests"("event_id", "status");
