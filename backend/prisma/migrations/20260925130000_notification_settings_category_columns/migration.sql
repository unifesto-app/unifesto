-- The chat feature added chatMessages / registrationUpdates / spaceUpdates to
-- the NotificationSettings model without a migration. Prod only ever got
-- chat_messages (applied by hand), so every GET/PATCH of
-- /users/me/notification-settings failed with P2022 (500). IF NOT EXISTS keeps
-- this safe on databases that already have some or all of the columns.
ALTER TABLE "notification_settings"
  ADD COLUMN IF NOT EXISTS "chat_messages" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "registration_updates" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "space_updates" BOOLEAN NOT NULL DEFAULT true;
