-- Remove the payout type (T+2 / Instant) concept entirely.
--
-- Payouts are settled manually by an admin, so there is no scheduling or fee
-- difference between "standard" and "instant" any more — every payout is simply
-- queued for immediate action (scheduled_at = now). The column and its enum are
-- dropped; the value carried no remaining meaning.

-- DropColumn
ALTER TABLE "payouts" DROP COLUMN "type";

-- DropEnum
DROP TYPE "payout_type";
