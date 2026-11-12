-- Who pays the processing fee is Unifesto's call per space (12 Nov 2026):
-- new events copy it, and setting it in Apex writes every event of the space.
-- Existing events keep the value their organisers set until then.
ALTER TABLE "spaces" ADD COLUMN "absorb_processing_fee" BOOLEAN NOT NULL DEFAULT false;
