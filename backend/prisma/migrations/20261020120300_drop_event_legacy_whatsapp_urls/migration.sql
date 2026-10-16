-- contract-step: S42 drops the retired public event WhatsApp links (retired
-- 2026-09-20, "do not read"). Invites use whatsapp_attendee_group_url and the
-- per-ticket-type link; these were only ever written, and stripped from the
-- public payload, so older mobile builds already saw them as absent.
ALTER TABLE "events"
  DROP COLUMN IF EXISTS "whatsapp_group_url",
  DROP COLUMN IF EXISTS "whatsapp_community_url";
