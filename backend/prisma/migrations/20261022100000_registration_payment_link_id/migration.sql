-- A19: remember the Razorpay Payment Link sent on a curator "collect payment"
-- add, so checkout cleanup cancels the row (and the link) instead of deleting it.
ALTER TABLE "event_registrations" ADD COLUMN "payment_link_id" VARCHAR(255);
