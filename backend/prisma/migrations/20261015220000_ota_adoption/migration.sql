-- O13: which EAS runtime + OTA update each user's app is running (self-reported).
ALTER TABLE "users" ADD COLUMN "app_runtime_version" VARCHAR(64);
ALTER TABLE "users" ADD COLUMN "app_update_id" VARCHAR(36);

-- O12: latest OTA status of main, posted by CI.
ALTER TABLE "platform_config" ADD COLUMN "ota_main_status" JSONB;
