-- Space verification (official/affiliated badge) + requester authority declaration.
ALTER TABLE "spaces" ADD COLUMN "verified_at" TIMESTAMPTZ(6);
ALTER TABLE "spaces" ADD COLUMN "verified_by" UUID;

ALTER TABLE "space_requests" ADD COLUMN "requester_role" VARCHAR(120);
ALTER TABLE "space_requests" ADD COLUMN "authority_confirmed_at" TIMESTAMPTZ(6);
