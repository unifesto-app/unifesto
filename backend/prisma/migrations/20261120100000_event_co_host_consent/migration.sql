-- F8: co-hosting becomes a request the invited space accepts. A null
-- accepted_at is a pending invite that grants nothing yet.
ALTER TABLE "event_co_hosts" ADD COLUMN "accepted_at" TIMESTAMPTZ(6),
ADD COLUMN "accepted_by" UUID;

-- Links made before consent existed stay live.
UPDATE "event_co_hosts" SET "accepted_at" = "created_at";
