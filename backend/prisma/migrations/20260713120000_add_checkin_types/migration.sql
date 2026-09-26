-- Multiple check-in points per event (Entry, Lunch, Day 1, Session A, …),
-- per-point check-in records, and per-point access grants.

CREATE TABLE event_checkin_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX event_checkin_types_event_id_idx ON event_checkin_types(event_id);

CREATE TABLE event_checkin_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
  checkin_type_id UUID NOT NULL REFERENCES event_checkin_types(id) ON DELETE CASCADE,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_in_by UUID NOT NULL,
  CONSTRAINT event_checkin_records_reg_type_unique UNIQUE (registration_id, checkin_type_id)
);
CREATE INDEX event_checkin_records_checkin_type_id_idx ON event_checkin_records(checkin_type_id);

-- Make check-in access per-point. Existing grants (checkin_type_id NULL) mean
-- "all points", preserving current behaviour.
ALTER TABLE event_checkin_access
  DROP CONSTRAINT IF EXISTS event_checkin_access_event_user_unique,
  ADD COLUMN checkin_type_id UUID REFERENCES event_checkin_types(id) ON DELETE CASCADE;

-- Drop the Prisma-generated unique index name too, if that was used instead.
DROP INDEX IF EXISTS "event_checkin_access_event_id_user_id_key";

CREATE UNIQUE INDEX event_checkin_access_event_user_type_unique
  ON event_checkin_access(event_id, user_id, checkin_type_id);
