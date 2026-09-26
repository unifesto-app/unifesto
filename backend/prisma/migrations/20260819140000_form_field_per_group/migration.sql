-- Custom form fields: per-member vs per-group capture (group tickets only).
--
-- `per_group = false` (the default) means the question is asked of EVERY member
-- of a group — exactly today's behaviour, so every existing field keeps working
-- unchanged. `per_group = true` means it is asked ONCE for the whole team and
-- stored on the registration rather than on each member.
ALTER TABLE "event_form_fields"
  ADD COLUMN "per_group" BOOLEAN NOT NULL DEFAULT false;
