-- Promo-credit expiry: PROMO_CREDIT lots carry an expiry; refund credit never expires.
ALTER TABLE "wallet_transactions" ADD COLUMN "expires_at" TIMESTAMPTZ(6);

-- Backfill existing promo credits to 12 months from when they were granted so the
-- sweep has a defined horizon for historical balances (refund/adjustment rows stay null).
UPDATE "wallet_transactions"
SET "expires_at" = "created_at" + INTERVAL '12 months'
WHERE "ledger_category" = 'PROMO_CREDIT' AND "type" = 'CREDIT';
