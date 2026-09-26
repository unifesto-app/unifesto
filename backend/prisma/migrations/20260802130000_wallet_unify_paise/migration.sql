-- Wallet repurpose, phase 1: unify the balance to integer paise (₹) alongside
-- the legacy coin columns, and split every transaction into an accounting lot.
--
-- Value-preserving: existing coin balances convert at the current 9:1 rate
-- (9 coins = ₹1 = 100 paise), rounding UP so no user loses a fraction. Legacy
-- balances are treated as promo credit (the coin economy was loyalty/marketing);
-- refund credit starts empty and accrues from the new instant-refund path.
-- The coin columns stay authoritative for now — the paise columns become the
-- money-of-record at the mobile cutover.

-- CreateEnum
CREATE TYPE "ledger_category" AS ENUM ('REFUND_CREDIT', 'PROMO_CREDIT', 'SPEND', 'ADJUSTMENT');

-- AlterTable: wallets
ALTER TABLE "wallets"
  ADD COLUMN "balance_paise"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "promo_balance_paise"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refund_balance_paise" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "total_earned_paise"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "total_spent_paise"    INTEGER NOT NULL DEFAULT 0;

-- AlterTable: wallet_transactions
ALTER TABLE "wallet_transactions"
  ADD COLUMN "ledger_category"     "ledger_category",
  ADD COLUMN "amount_paise"        INTEGER,
  ADD COLUMN "balance_after_paise" INTEGER,
  ADD COLUMN "spent_promo_paise"   INTEGER,
  ADD COLUMN "spent_refund_paise"  INTEGER;

-- Backfill wallets: coins → paise at 9:1, rounded up. All legacy balance is
-- promo credit; refund lot starts at 0.
UPDATE "wallets" SET
  "balance_paise"        = CEIL("balance"      * 100.0 / 9)::int,
  "promo_balance_paise"  = CEIL("balance"      * 100.0 / 9)::int,
  "refund_balance_paise" = 0,
  "total_earned_paise"   = CEIL("total_earned" * 100.0 / 9)::int,
  "total_spent_paise"    = CEIL("total_spent"  * 100.0 / 9)::int;

-- Backfill transactions: paise value + accounting category derived from type/source.
UPDATE "wallet_transactions" SET
  "amount_paise"        = CEIL("coins"          * 100.0 / 9)::int,
  "balance_after_paise" = CEIL("balance_after"  * 100.0 / 9)::int,
  "ledger_category"     = CASE
    WHEN "type" = 'DEBIT'          THEN 'SPEND'::"ledger_category"
    WHEN "source" = 'REFUND'       THEN 'REFUND_CREDIT'::"ledger_category"
    WHEN "source" = 'ADMIN_GRANT'  THEN 'ADJUSTMENT'::"ledger_category"
    ELSE 'PROMO_CREDIT'::"ledger_category"
  END;

-- Historical spends drew from the (only) promo lot.
UPDATE "wallet_transactions" SET
  "spent_promo_paise"  = CEIL("coins" * 100.0 / 9)::int,
  "spent_refund_paise" = 0
WHERE "type" = 'DEBIT';

-- Instant refund-to-wallet opt-in on refund requests (default: bank payout).
CREATE TYPE "refund_method" AS ENUM ('BANK', 'WALLET');

ALTER TABLE "refund_requests"
  ADD COLUMN "refund_method" "refund_method" NOT NULL DEFAULT 'BANK';
