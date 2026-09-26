-- Admin product/app announcements: opt-OUT category (on by default), distinct
-- from the opt-in `promotions` marketing category.
ALTER TABLE "notification_settings"
  ADD COLUMN "product_updates" BOOLEAN NOT NULL DEFAULT true;

-- Persist which NotificationCategory a broadcast sent under. Existing rows keep
-- the historical behaviour ('promotions'); new admin broadcasts pick per-send.
ALTER TABLE "push_campaigns"
  ADD COLUMN "category" VARCHAR(64) NOT NULL DEFAULT 'promotions';
