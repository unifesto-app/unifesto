-- J2: the */15 auto-refund retry crons filter `refund_due_at <= now()` on
-- these tables; without an index each run seq-scans them. Additive. Plain
-- (not CONCURRENTLY) so all four fit one file; the tables are small enough
-- that the brief build lock is harmless.
CREATE INDEX IF NOT EXISTS "event_registrations_refund_due_at_idx" ON "event_registrations"("refund_due_at");
CREATE INDEX IF NOT EXISTS "group_seat_purchases_refund_due_at_idx" ON "group_seat_purchases"("refund_due_at");
CREATE INDEX IF NOT EXISTS "session_registrations_refund_due_at_idx" ON "session_registrations"("refund_due_at");
CREATE INDEX IF NOT EXISTS "stay_bookings_refund_due_at_idx" ON "stay_bookings"("refund_due_at");
