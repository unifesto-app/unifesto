-- Q17: per-event switch for attendees to transfer their own free ticket. Off by default.
ALTER TABLE "events" ADD COLUMN "allow_self_transfer" BOOLEAN NOT NULL DEFAULT false;
