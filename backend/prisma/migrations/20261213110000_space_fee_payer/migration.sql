-- Who pays the processing fee is Unifesto's call per space (12 Nov 2026):
-- new events copy it, and setting it in Apex writes every event of the space.
-- Existing events keep the value their organisers set until then.
ALTER TABLE "spaces" ADD COLUMN "absorb_processing_fee" BOOLEAN NOT NULL DEFAULT false;

-- A space whose every event already includes the fee starts as "included",
-- so Billing and its events agree. Mixed spaces stay false until Apex sets them.
UPDATE "spaces" s SET "absorb_processing_fee" = true
 WHERE EXISTS (SELECT 1 FROM "events" e WHERE e."space_id" = s."id")
   AND NOT EXISTS (SELECT 1 FROM "events" e WHERE e."space_id" = s."id" AND e."absorb_processing_fee" = false);
