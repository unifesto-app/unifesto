-- WhatsApp group-invite delivery tracking on each registration.
-- whatsapp_invite_sent_at  : stamped when the group/community link is pushed to
--                            the attendee (on registration, or a curator blast);
--                            null = never sent, which is how a re-blast dedups.
-- whatsapp_group_joined_at : the attendee's own "I've joined" self-mark; set, it
--                            suppresses further sends (WhatsApp can't report real
--                            group joins, so this is the only join signal).
ALTER TABLE "event_registrations"
  ADD COLUMN "whatsapp_invite_sent_at" TIMESTAMPTZ(6),
  ADD COLUMN "whatsapp_group_joined_at" TIMESTAMPTZ(6);
