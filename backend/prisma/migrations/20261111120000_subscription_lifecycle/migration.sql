-- T8 subscription lifecycle: scheduled downgrades + what each payment paid.
-- Additive only.
ALTER TABLE "org_subscriptions" ADD COLUMN "pending_plan" "org_plan";
ALTER TABLE "org_subscriptions" ADD COLUMN "pending_billing_cycle" "billing_cycle";

ALTER TABLE "subscription_history" ADD COLUMN "order_id" VARCHAR(255);
ALTER TABLE "subscription_history" ADD COLUMN "amount_paise" INTEGER;
CREATE UNIQUE INDEX "subscription_history_order_id_key" ON "subscription_history"("order_id");

-- MRR now reads amount_paise. Payments before this recorded only the order
-- amount on the subscription row, so carry it onto the payment that bought
-- the current plan. Data only.
UPDATE subscription_history h
SET amount_paise = ROUND(s.amount * 100)::INTEGER
FROM org_subscriptions s
WHERE s.id = h.subscription_id
  AND h.payment_id IS NOT NULL
  AND h.amount_paise IS NULL
  AND h.to_plan = s.plan
  AND s.amount > 0;
