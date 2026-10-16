-- S50/S51: session payments (session cancelled, or it filled up while paying)
-- and extra-seats payments that couldn't add seats are refunded through a
-- claimed refund_due_at marker, like event_registrations / stay_bookings, so
-- two callers can't refund twice and a failed refund is retried. Additive, nullable.
ALTER TABLE "session_registrations" ADD COLUMN "refund_due_at" TIMESTAMPTZ(6);
ALTER TABLE "group_seat_purchases" ADD COLUMN "refund_due_at" TIMESTAMPTZ(6);
