-- S10/S15: a captured payment that couldn't be honoured (ticket sold out while
-- paying, stay expired/cancelled before a late payment) is refunded in full.
-- refund_due_at marks one whose automatic refund hasn't gone through yet, so a
-- retry job can finish it and payouts never count the money. Additive, nullable.
ALTER TABLE "event_registrations" ADD COLUMN "refund_due_at" TIMESTAMPTZ(6);
ALTER TABLE "stay_bookings" ADD COLUMN "refund_due_at" TIMESTAMPTZ(6);
