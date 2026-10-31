-- Q29: spaces start live and Unverified. Spaces still waiting for review go
-- live now; verified_at is left alone (null = Unverified). REJECTED rows stay
-- as history. Space and event requests still waiting go live through the
-- backend's one-shot launch sweep (SpacesService.goLiveWaitingRequests), which
-- also resolves their Assist cases.
UPDATE "spaces"
SET "status" = 'ACTIVE', "approved_at" = COALESCE("approved_at", now())
WHERE "status" = 'PENDING';

ALTER TABLE "spaces" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
