-- Two-sided transfer of an event's ownership to one of its co-host spaces.
-- The owning space requests it; a Space Admin of the target co-host accepts,
-- at which point Event.space_id moves (payouts + plan gating follow ownership).

CREATE TABLE "event_ownership_transfers" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id"     UUID NOT NULL,
  "from_space_id" UUID NOT NULL,
  "to_space_id"  UUID NOT NULL,
  "requested_by" UUID NOT NULL,
  "reason"       TEXT,
  "status"       VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "review_note"  TEXT,
  "reviewed_by"  UUID,
  "reviewed_at"  TIMESTAMPTZ(6),
  "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"   TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "event_ownership_transfers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "event_ownership_transfers_event_id_idx" ON "event_ownership_transfers"("event_id");
CREATE INDEX "event_ownership_transfers_to_space_id_idx" ON "event_ownership_transfers"("to_space_id");
CREATE INDEX "event_ownership_transfers_status_idx" ON "event_ownership_transfers"("status");

ALTER TABLE "event_ownership_transfers"
  ADD CONSTRAINT "event_ownership_transfers_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_ownership_transfers"
  ADD CONSTRAINT "event_ownership_transfers_from_space_id_fkey"
  FOREIGN KEY ("from_space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_ownership_transfers"
  ADD CONSTRAINT "event_ownership_transfers_to_space_id_fkey"
  FOREIGN KEY ("to_space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_ownership_transfers"
  ADD CONSTRAINT "event_ownership_transfers_requested_by_fkey"
  FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
