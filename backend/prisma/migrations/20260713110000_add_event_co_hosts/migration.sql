-- Event co-hosting: a space invited to co-host an event gets the same
-- event-management access as the owning space's organisers.

CREATE TABLE event_co_hosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_co_hosts_event_space_unique UNIQUE (event_id, space_id)
);

CREATE INDEX event_co_hosts_event_id_idx ON event_co_hosts(event_id);
CREATE INDEX event_co_hosts_space_id_idx ON event_co_hosts(space_id);
