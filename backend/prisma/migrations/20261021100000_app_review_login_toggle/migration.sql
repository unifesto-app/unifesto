-- App Review login moves from the APP_REVIEW_LOGIN_ENABLED env flag to an
-- Apex toggle. Starts off, whatever the env said.
ALTER TABLE "platform_config" ADD COLUMN "app_review_login_enabled" BOOLEAN NOT NULL DEFAULT false;
