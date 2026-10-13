-- S1/S2/S3 (payment receipt replay) + S28 (webhook dedup).
-- Before deploying, run this read-only check on prod; any row returned makes
-- the UNIQUE indexes below fail and must be resolved by hand first:
--   SELECT 'event' AS t, payment_id, count(*) FROM event_registrations
--     WHERE payment_id IS NOT NULL GROUP BY payment_id HAVING count(*) > 1
--   UNION ALL
--   SELECT 'session', payment_id, count(*) FROM session_registrations
--     WHERE payment_id IS NOT NULL GROUP BY payment_id HAVING count(*) > 1;

-- One Razorpay payment settles at most one event / session registration.
-- (Postgres treats NULLs as distinct, so unpaid rows are unaffected.)
CREATE UNIQUE INDEX "event_registrations_payment_id_key" ON "event_registrations"("payment_id");
CREATE UNIQUE INDEX "session_registrations_payment_id_key" ON "session_registrations"("payment_id");

-- Webhook / verify look rows up by order id. Not unique: reconcile re-homes an
-- orphaned payment onto another row that then shares the order id.
CREATE INDEX "event_registrations_order_id_idx" ON "event_registrations"("order_id");
CREATE INDEX "session_registrations_order_id_idx" ON "session_registrations"("order_id");

-- A subscription upgrade payment can be used once.
ALTER TABLE "subscription_history" ADD COLUMN "payment_id" VARCHAR(255);
CREATE UNIQUE INDEX "subscription_history_payment_id_key" ON "subscription_history"("payment_id");

-- Processed webhook deliveries (Razorpay x-razorpay-event-id).
CREATE TABLE "webhook_events" (
    "id" VARCHAR(255) NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);
