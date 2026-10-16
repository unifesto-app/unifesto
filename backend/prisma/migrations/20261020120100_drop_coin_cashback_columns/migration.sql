-- contract-step: S42 drops the coin / wallet-cashback money columns. The wallet
-- was removed 2026-09-14 (balances voided); nothing reads or writes these.
ALTER TABLE "event_registrations"
  DROP COLUMN IF EXISTS "coins_used",
  DROP COLUMN IF EXISTS "coin_value_inr",
  DROP COLUMN IF EXISTS "cashback_paise";
ALTER TABLE "refund_requests" DROP COLUMN IF EXISTS "coins_refunded";
