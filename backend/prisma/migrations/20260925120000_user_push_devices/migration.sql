-- Links each user to the OneSignal push subscriptions (devices) they've signed
-- in on, so the backend knows who is reachable and can link external_id itself.
-- CreateTable
CREATE TABLE "user_push_devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "subscription_id" VARCHAR(64) NOT NULL,
    "one_signal_id" VARCHAR(64),
    "platform" VARCHAR(10) NOT NULL,
    "device_model" VARCHAR(120),
    "app_version" VARCHAR(20),
    "opted_in" BOOLEAN NOT NULL DEFAULT false,
    "linked_at" TIMESTAMPTZ(6),
    "link_error" TEXT,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_push_devices_subscription_id_key" ON "user_push_devices"("subscription_id");

-- CreateIndex
CREATE INDEX "user_push_devices_user_id_idx" ON "user_push_devices"("user_id");

-- AddForeignKey
ALTER TABLE "user_push_devices" ADD CONSTRAINT "user_push_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
