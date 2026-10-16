-- contract-step: S42 drops the referral system's dormant schema. Referrals were
-- removed 2026-08-05; no code reads or writes these since 051add3.
DROP TABLE IF EXISTS "referrals";
DROP INDEX IF EXISTS "users_referral_code_key";
ALTER TABLE "users" DROP COLUMN IF EXISTS "referral_code";
ALTER TABLE "notification_settings" DROP COLUMN IF EXISTS "referral_updates";
