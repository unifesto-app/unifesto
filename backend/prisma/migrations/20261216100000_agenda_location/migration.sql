-- A track, hall or stage per agenda slot, for parallel sessions.
ALTER TABLE "event_agenda" ADD COLUMN "location" VARCHAR(255);
