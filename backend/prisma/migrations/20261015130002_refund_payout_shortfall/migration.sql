-- S12: flag a refund that lands after the event was already paid out past what
-- it now earns. Nullable; set only on such refunds.
ALTER TABLE "refund_requests" ADD COLUMN "payout_shortfall" DECIMAL(10,2);
