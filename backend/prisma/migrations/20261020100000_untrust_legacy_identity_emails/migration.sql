-- S53: legacy rows stored email_verified = (email IS NOT NULL), and verified
-- emails drive account auto-linking. Keep that trust only where the provider
-- itself proves the address: EMAIL (OTP to it), GOOGLE and APPLE (IdP claim).
-- Every other provider's email is unproven. UPDATE only; no schema change.
UPDATE "user_identities"
SET "email_verified" = false
WHERE "provider" NOT IN ('EMAIL', 'GOOGLE', 'APPLE')
  AND "email_verified" IS DISTINCT FROM false;
