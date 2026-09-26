-- Backfill the new private attendee invite group from the retired public links,
-- so live events keep routing attendees into the same WhatsApp chat without the
-- operator having to re-enter anything.
--
-- COALESCE(group, community) reproduces the OLD invite precedence exactly: the
-- retired chain was group -> community -> parent community, so an event that had
-- its own group keeps it, and a big event that only had a community keeps that.
-- The parent-fallback at resolve time still works because each parent row gets
-- its own community copied into its own attendee field here.
--
-- Idempotent: only fills rows where the new column is still NULL, so it is safe
-- to re-run and never overwrites a link an operator has already set on the new
-- WhatsApp page.

UPDATE "events"
SET "whatsapp_attendee_group_url" = COALESCE("whatsapp_group_url", "whatsapp_community_url")
WHERE "whatsapp_attendee_group_url" IS NULL
  AND COALESCE("whatsapp_group_url", "whatsapp_community_url") IS NOT NULL;
