-- 4.0.5: the app build a support ticket was raised from (version, build,
-- runtime, OTA update id, platform), so staff can tie a report to an update.
-- Additive, nullable.
ALTER TABLE "support_tickets" ADD COLUMN "client_info" JSONB;
