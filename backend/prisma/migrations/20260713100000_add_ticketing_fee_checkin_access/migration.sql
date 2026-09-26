-- Ticketing (RSVP / individual / group), global processing fee, and
-- delegated per-event check-in access.

-- New enums for the ticket model
CREATE TYPE ticket_kind AS ENUM ('RSVP', 'INDIVIDUAL', 'GROUP');
CREATE TYPE group_pricing_mode AS ENUM ('PER_GROUP', 'PER_PERSON');

-- Extend ticket types with kind + group configuration; quantity becomes optional
-- (null = unlimited capacity).
ALTER TABLE event_ticket_types
  ALTER COLUMN total_quantity DROP NOT NULL,
  ADD COLUMN kind ticket_kind NOT NULL DEFAULT 'INDIVIDUAL',
  ADD COLUMN group_pricing_mode group_pricing_mode,
  ADD COLUMN min_group_size INTEGER,
  ADD COLUMN max_group_size INTEGER;

-- Group registration details
ALTER TABLE event_registrations
  ADD COLUMN group_size INTEGER,
  ADD COLUMN group_members JSONB;

-- Delegated check-in access: a user granted check-in rights for one event.
CREATE TABLE event_checkin_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_checkin_access_event_user_unique UNIQUE (event_id, user_id)
);

CREATE INDEX event_checkin_access_event_id_idx ON event_checkin_access(event_id);
CREATE INDEX event_checkin_access_user_id_idx ON event_checkin_access(user_id);

-- Platform-wide settings singleton (id is always 'global').
CREATE TABLE platform_config (
  id TEXT PRIMARY KEY DEFAULT 'global',
  processing_fee_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the singleton row so reads never miss.
INSERT INTO platform_config (id, processing_fee_percent) VALUES ('global', 0)
  ON CONFLICT (id) DO NOTHING;
