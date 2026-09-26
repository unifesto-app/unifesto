-- Drop the now-dead instant_fee column on payouts.
--
-- The instant-payout surcharge was removed along with the T+2/Instant payout
-- type; the column has only stored 0 since. Payout amounts are net withdrawals
-- (gross == net, platform fee accounted at the event level), so no fee column
-- beyond platform_fee is needed.

-- DropColumn
ALTER TABLE "payouts" DROP COLUMN "instant_fee";
