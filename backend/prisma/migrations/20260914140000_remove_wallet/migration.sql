-- Remove the coins/wallet feature entirely.
--
-- The wallet had sealed inflows and outflows (no referrals to earn, nothing to
-- redeem) and its per-transaction cashback was a live liability against reserves.
-- Confirmed no real user money is held in any wallet, so balances are voided by
-- dropping the tables outright. Refunds are now always issued to the original
-- payment method (RefundMethod.BANK).
--
-- The coin/cashback columns on `event_registrations` and `refund_requests`
-- (coins_used, coin_value_inr, cashback_paise, coins_refunded) are intentionally
-- LEFT in place as dormant, always-zero columns: they carry historical audit
-- data on core financial records and dropping columns from the largest tables
-- would be high-risk for no functional benefit. No code writes non-zero to them.

-- ---------------------------------------------------------------------------
-- 1) Drop the wallet-cluster tables (leaf foreign keys first). CASCADE clears
--    any remaining FK constraints defensively.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "wallet_transactions" CASCADE;
DROP TABLE IF EXISTS "redeem_code_usage" CASCADE;
DROP TABLE IF EXISTS "wallets" CASCADE;
DROP TABLE IF EXISTS "redeem_codes" CASCADE;
DROP TABLE IF EXISTS "partners" CASCADE;

-- ---------------------------------------------------------------------------
-- 2) Drop the now-unused enums that only the wallet ledger referenced.
-- ---------------------------------------------------------------------------
DROP TYPE IF EXISTS "coin_source";
DROP TYPE IF EXISTS "ledger_category";
DROP TYPE IF EXISTS "transaction_type";

-- ---------------------------------------------------------------------------
-- 3) Remove the WALLET value from the refund_method enum. Postgres cannot drop
--    an enum value in place, so recreate the type. Any historical rows set to
--    WALLET are re-pointed to BANK first (their money was already handled at the
--    time the refund was settled).
-- ---------------------------------------------------------------------------
UPDATE "refund_requests" SET "refund_method" = 'BANK' WHERE "refund_method" = 'WALLET';

ALTER TYPE "refund_method" RENAME TO "refund_method_old";
CREATE TYPE "refund_method" AS ENUM ('BANK');
ALTER TABLE "refund_requests" ALTER COLUMN "refund_method" DROP DEFAULT;
ALTER TABLE "refund_requests"
  ALTER COLUMN "refund_method" TYPE "refund_method"
  USING ("refund_method"::text::"refund_method");
ALTER TABLE "refund_requests" ALTER COLUMN "refund_method" SET DEFAULT 'BANK';
DROP TYPE "refund_method_old";

-- ---------------------------------------------------------------------------
-- 4) Drop the wallet notification-settings toggle (no wallet events remain).
-- ---------------------------------------------------------------------------
ALTER TABLE "notification_settings" DROP COLUMN IF EXISTS "wallet_updates";
