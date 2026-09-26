-- Organiser-supplied WhatsApp invite links on events. There is no WhatsApp API
-- to auto-create groups/communities, so the organiser creates them by hand and
-- pastes the chat.whatsapp.com/<code> link. A big/parent event carries a
-- community link (the umbrella); a sub-event or standalone event carries a
-- group link. Both nullable — the vast majority of events will have neither.

ALTER TABLE "events" ADD COLUMN "whatsapp_group_url" TEXT;
ALTER TABLE "events" ADD COLUMN "whatsapp_community_url" TEXT;
