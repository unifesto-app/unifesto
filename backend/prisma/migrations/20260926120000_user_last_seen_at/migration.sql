-- Real "last seen" tracker: stamped by JwtAuthGuard on authenticated requests
-- (throttled to 1 write / user / 5 min). Add-only, nullable.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMPTZ(6);

-- Seed from the best signals we already have, so existing users don't all show
-- "never" until their next request: the mobile app-version report and the
-- push-device registry's per-device last_seen_at.
UPDATE "users" u
SET "last_seen_at" = GREATEST(
  u."app_version_last_reported_at",
  (SELECT MAX(d."last_seen_at") FROM "user_push_devices" d WHERE d."user_id" = u."id")
)
WHERE u."last_seen_at" IS NULL
  AND u."deleted_at" IS NULL;
