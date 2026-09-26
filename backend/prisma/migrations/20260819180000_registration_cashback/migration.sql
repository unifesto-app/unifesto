-- 1% loyalty cashback on paid registrations (retires the coin-based earns).

-- New wallet-transaction source for the cashback credit / reversal.
ALTER TYPE "coin_source" ADD VALUE IF NOT EXISTS 'REGISTRATION_CASHBACK';

-- Record the exact cashback (in paise) granted per registration, so a
-- cancellation can reclaim precisely what was given. 0 = free / RSVP / no cashback.
ALTER TABLE "event_registrations"
  ADD COLUMN IF NOT EXISTS "cashback_paise" INTEGER NOT NULL DEFAULT 0;
