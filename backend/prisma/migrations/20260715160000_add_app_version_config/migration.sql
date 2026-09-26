-- Mobile app version policy on the singleton platform_config row.
-- Drives the in-app "update available" prompt (latest = optional, minimum = forced).
ALTER TABLE "platform_config"
  ADD COLUMN "ios_latest_version"      TEXT NOT NULL DEFAULT '2.0.1',
  ADD COLUMN "ios_minimum_version"     TEXT NOT NULL DEFAULT '0.0.0',
  ADD COLUMN "ios_store_url"           TEXT NOT NULL DEFAULT 'https://apps.apple.com/in/app/unifesto-discover-events/id6767165496',
  ADD COLUMN "android_latest_version"  TEXT NOT NULL DEFAULT '2.0.1',
  ADD COLUMN "android_minimum_version" TEXT NOT NULL DEFAULT '0.0.0',
  ADD COLUMN "android_store_url"       TEXT NOT NULL DEFAULT 'https://play.google.com/store/apps/details?id=com.unifesto.app';
