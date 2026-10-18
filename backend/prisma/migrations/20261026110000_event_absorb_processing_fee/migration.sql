-- A33 (D11): an organiser can absorb the buyer fee into the ticket price.
ALTER TABLE "events" ADD COLUMN "absorb_processing_fee" BOOLEAN NOT NULL DEFAULT false;
