-- Private attendee invite group. The legacy whatsapp_group_url /
-- whatsapp_community_url columns doubled as the public "Join" button AND the
-- attendee invite source, so the invite link leaked on the public event payload
-- (older mobile builds still render it). This dedicated column is surfaced only
-- through authenticated per-registration endpoints and is stripped from the
-- public getEventBySlug response, so the invite link never reaches non-attendees.
-- Nullable: the vast majority of events have no WhatsApp group.

ALTER TABLE "events" ADD COLUMN "whatsapp_attendee_group_url" TEXT;
