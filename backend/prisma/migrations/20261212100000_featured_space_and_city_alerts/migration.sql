-- Featured space on the app Home (set from Apex) and per-user city alert.
ALTER TABLE "spaces" ADD COLUMN "featured_at" TIMESTAMPTZ(6);
ALTER TABLE "users" ADD COLUMN "new_events_city" VARCHAR(100);
