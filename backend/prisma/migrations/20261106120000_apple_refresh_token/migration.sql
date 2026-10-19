-- O17: Sign in with Apple refresh token (encrypted), revoked on account deletion.
ALTER TABLE "user_identities" ADD COLUMN "apple_refresh_token" TEXT;
