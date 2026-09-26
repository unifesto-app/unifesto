-- Per-user app client info, self-reported by the mobile app on session start.
-- Distinct from the app-version *policy* (latest/minimum) used for forced updates:
-- this records the version each individual account is actually running.
ALTER TABLE "users" ADD COLUMN "app_version" VARCHAR(20);
ALTER TABLE "users" ADD COLUMN "app_platform" VARCHAR(10);
ALTER TABLE "users" ADD COLUMN "app_version_last_reported_at" TIMESTAMPTZ(6);
