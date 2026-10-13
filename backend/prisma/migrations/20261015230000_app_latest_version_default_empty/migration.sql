-- O6: the soft "update available" prompt is off until an admin sets a latest
-- store version. Default only; the existing platform_config row is untouched
-- (clear it from Apex > App version if it still holds an old value).
ALTER TABLE "platform_config" ALTER COLUMN "ios_latest_version" SET DEFAULT '';
ALTER TABLE "platform_config" ALTER COLUMN "android_latest_version" SET DEFAULT '';
