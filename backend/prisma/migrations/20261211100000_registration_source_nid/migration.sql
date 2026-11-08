-- C19: the notification a booking came from (see notifications/nid.ts).
ALTER TABLE "event_registrations" ADD COLUMN     "source_nid" VARCHAR(80);

-- CreateIndex
CREATE INDEX "event_registrations_source_nid_idx" ON "event_registrations"("source_nid");
