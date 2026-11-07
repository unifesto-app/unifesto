-- C12: installs on native push (APNs / FCM) report a device token instead of a
-- OneSignal subscription id. Old builds keep their subscription rows.
ALTER TABLE "user_push_devices" ALTER COLUMN "subscription_id" DROP NOT NULL;
ALTER TABLE "user_push_devices" ADD COLUMN "token" VARCHAR(512);
ALTER TABLE "user_push_devices" ADD COLUMN "sandbox" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "user_push_devices_token_key" ON "user_push_devices"("token");

ALTER TABLE "user_push_devices"
  ADD CONSTRAINT "user_push_devices_subscription_or_token"
  CHECK ("subscription_id" IS NOT NULL OR "token" IS NOT NULL);
