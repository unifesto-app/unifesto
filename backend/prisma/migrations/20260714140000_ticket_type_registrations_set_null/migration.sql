-- Deleting a ticket type should detach its registrations (set ticket_type_id to
-- NULL) rather than fail on the foreign key. Preserves attendee records.

ALTER TABLE event_registrations
  DROP CONSTRAINT IF EXISTS event_registrations_ticket_type_id_fkey;

ALTER TABLE event_registrations
  ADD CONSTRAINT event_registrations_ticket_type_id_fkey
  FOREIGN KEY (ticket_type_id) REFERENCES event_ticket_types(id) ON DELETE SET NULL;
