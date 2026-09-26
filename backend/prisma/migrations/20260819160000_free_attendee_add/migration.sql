-- Manual attendee add: gate "add for free" (comping a paid ticket) behind a
-- per-event Platform-Admin approval, so the platform fee is never silently
-- waived. Default OFF — organisers must collect payment unless approved.
ALTER TABLE "events"
  ADD COLUMN "allow_free_attendee_add" BOOLEAN NOT NULL DEFAULT false;

-- The request an organiser raises to be granted the exception on one event.
-- Mirrors white_label_requests: PENDING → APPROVED/REJECTED by a Platform Admin.
CREATE TABLE "free_attendee_add_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "review_note" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "free_attendee_add_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "free_attendee_add_requests_space_id_idx" ON "free_attendee_add_requests"("space_id");
CREATE INDEX "free_attendee_add_requests_event_id_idx" ON "free_attendee_add_requests"("event_id");
CREATE INDEX "free_attendee_add_requests_requested_by_idx" ON "free_attendee_add_requests"("requested_by");
CREATE INDEX "free_attendee_add_requests_status_idx" ON "free_attendee_add_requests"("status");

ALTER TABLE "free_attendee_add_requests"
  ADD CONSTRAINT "free_attendee_add_requests_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "free_attendee_add_requests"
  ADD CONSTRAINT "free_attendee_add_requests_space_id_fkey"
  FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "free_attendee_add_requests"
  ADD CONSTRAINT "free_attendee_add_requests_requested_by_fkey"
  FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
