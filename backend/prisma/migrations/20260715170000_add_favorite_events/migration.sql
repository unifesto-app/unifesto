-- A user's saved / favourited events. One row per (user, event).

CREATE TABLE "favorite_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "favorite_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "favorite_events_user_id_event_id_key" ON "favorite_events"("user_id", "event_id");
CREATE INDEX "favorite_events_user_id_idx" ON "favorite_events"("user_id");
CREATE INDEX "favorite_events_event_id_idx" ON "favorite_events"("event_id");

ALTER TABLE "favorite_events"
  ADD CONSTRAINT "favorite_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "favorite_events"
  ADD CONSTRAINT "favorite_events_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
