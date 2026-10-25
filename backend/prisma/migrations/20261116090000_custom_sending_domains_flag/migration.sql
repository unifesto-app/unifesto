-- H20: custom sending domains stay off until the Resend plan allows more than
-- the one domain notify.unifesto.app uses. Additive only.
ALTER TABLE "platform_config" ADD COLUMN "custom_sending_domains_enabled" BOOLEAN NOT NULL DEFAULT false;
