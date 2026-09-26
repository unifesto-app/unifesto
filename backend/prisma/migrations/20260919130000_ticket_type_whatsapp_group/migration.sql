-- Per-ticket-type WhatsApp group invite link. Takes precedence over the event's
-- own group link for attendees on this ticket type; null falls back to the event
-- group, then the (event/parent) community.
ALTER TABLE "event_ticket_types"
  ADD COLUMN "whatsapp_group_url" TEXT;
