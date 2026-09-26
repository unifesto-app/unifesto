-- Custom registration form fields become per-ticket-type: each ticket/RSVP can
-- have its own form. Existing rows keep ticket_type_id NULL (event-wide form).

ALTER TABLE event_form_fields
  ADD COLUMN ticket_type_id UUID REFERENCES event_ticket_types(id) ON DELETE CASCADE;

CREATE INDEX event_form_fields_ticket_type_id_idx ON event_form_fields(ticket_type_id);
