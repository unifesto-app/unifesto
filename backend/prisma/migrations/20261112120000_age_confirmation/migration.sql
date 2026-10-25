-- Z11 (DPDP): 18+ self-confirmation on the user + platform switch to enforce it.
-- Additive only.
ALTER TABLE "users" ADD COLUMN "age_confirmed_at" TIMESTAMPTZ(6);
ALTER TABLE "platform_config" ADD COLUMN "require_age_confirmation" BOOLEAN NOT NULL DEFAULT false;
