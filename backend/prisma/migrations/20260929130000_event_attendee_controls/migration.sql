-- 4.0.5: curator controls over attendees. Team leads may replace a group
-- member while allow_team_changes is on; attendees may edit their own answers
-- while attendee_edits_enabled is on and before attendee_edits_until.
-- Additive; both switches default off, so nothing changes until a curator opts in.
ALTER TABLE "events" ADD COLUMN "allow_team_changes" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "attendee_edits_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "attendee_edits_until" TIMESTAMPTZ(6);
