-- Offline check-in: let scanners pull "what changed since my last look".
-- updated_at catches registrations that were added, cancelled, paid or
-- restored; recorded_at is when the server stored a check-in, which for an
-- offline scan is later than its (device-time) checked_in_at.
-- Existing rows take the migration time, so the first pull after deploy
-- returns them once; after that only real changes come back.

ALTER TABLE "event_registrations" ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "event_checkin_records" ADD COLUMN "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "event_group_member_checkins" ADD COLUMN "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "event_registrations_event_id_updated_at_idx" ON "event_registrations"("event_id", "updated_at");
CREATE INDEX "event_checkin_records_recorded_at_idx" ON "event_checkin_records"("recorded_at");
CREATE INDEX "event_group_member_checkins_recorded_at_idx" ON "event_group_member_checkins"("recorded_at");
