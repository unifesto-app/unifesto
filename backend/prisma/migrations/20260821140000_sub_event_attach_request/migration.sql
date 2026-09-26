-- Cross-space sub-event nesting with the owner's consent. A space that owns a
-- parent "big event" asks to nest another space's event under it; a Space Admin
-- of the space that OWNS the child event must accept before the child's
-- parent_event_id is set. Same-space attaches never create a row here (they stay
-- instant). One PENDING row per child event, enforced in the service.

CREATE TABLE "sub_event_attach_requests" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "parent_event_id"     UUID NOT NULL,
  "child_event_id"      UUID NOT NULL,
  "requesting_space_id" UUID NOT NULL,
  "owner_space_id"      UUID NOT NULL,
  "requested_by"        UUID NOT NULL,
  "reason"              TEXT,
  "status"              VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "review_note"         TEXT,
  "reviewed_by"         UUID,
  "reviewed_at"         TIMESTAMPTZ(6),
  "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "sub_event_attach_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sub_event_attach_requests_child_event_id_idx" ON "sub_event_attach_requests"("child_event_id");
CREATE INDEX "sub_event_attach_requests_parent_event_id_idx" ON "sub_event_attach_requests"("parent_event_id");
CREATE INDEX "sub_event_attach_requests_owner_space_id_idx" ON "sub_event_attach_requests"("owner_space_id");
CREATE INDEX "sub_event_attach_requests_status_idx" ON "sub_event_attach_requests"("status");

ALTER TABLE "sub_event_attach_requests"
  ADD CONSTRAINT "sub_event_attach_requests_parent_event_id_fkey"
  FOREIGN KEY ("parent_event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sub_event_attach_requests"
  ADD CONSTRAINT "sub_event_attach_requests_child_event_id_fkey"
  FOREIGN KEY ("child_event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sub_event_attach_requests"
  ADD CONSTRAINT "sub_event_attach_requests_requesting_space_id_fkey"
  FOREIGN KEY ("requesting_space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sub_event_attach_requests"
  ADD CONSTRAINT "sub_event_attach_requests_owner_space_id_fkey"
  FOREIGN KEY ("owner_space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sub_event_attach_requests"
  ADD CONSTRAINT "sub_event_attach_requests_requested_by_fkey"
  FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
