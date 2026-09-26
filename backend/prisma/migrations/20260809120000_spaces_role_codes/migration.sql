-- Spaces platform re-architecture (P0.1): distinct role codes for the new IAM.
-- SPACE_ADMIN is SPACE-scoped; CURATOR / CO_CURATOR / CREW are EVENT-scoped.
-- Legacy ORGANISER / CO_ORGANISER / VOLUNTEER remain until the P2.2 backfill.
-- No enum value is *used* in this migration (rows are seeded separately), so
-- this is safe to run inside the migration transaction on Postgres 12+.
ALTER TYPE "role_code" ADD VALUE IF NOT EXISTS 'SPACE_ADMIN';
ALTER TYPE "role_code" ADD VALUE IF NOT EXISTS 'CURATOR';
ALTER TYPE "role_code" ADD VALUE IF NOT EXISTS 'CO_CURATOR';
ALTER TYPE "role_code" ADD VALUE IF NOT EXISTS 'CREW';
