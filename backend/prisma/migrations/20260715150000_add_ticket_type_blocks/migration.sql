-- Directional ticket restrictions. A user who holds `blocker_id` cannot
-- register for `blocked_id`. Both reference ticket types of the same event.

CREATE TABLE "ticket_type_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "ticket_type_blocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_type_blocks_blocker_id_blocked_id_key" ON "ticket_type_blocks"("blocker_id", "blocked_id");
CREATE INDEX "ticket_type_blocks_blocker_id_idx" ON "ticket_type_blocks"("blocker_id");
CREATE INDEX "ticket_type_blocks_blocked_id_idx" ON "ticket_type_blocks"("blocked_id");

ALTER TABLE "ticket_type_blocks"
  ADD CONSTRAINT "ticket_type_blocks_blocker_id_fkey"
  FOREIGN KEY ("blocker_id") REFERENCES "event_ticket_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_type_blocks"
  ADD CONSTRAINT "ticket_type_blocks_blocked_id_fkey"
  FOREIGN KEY ("blocked_id") REFERENCES "event_ticket_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
