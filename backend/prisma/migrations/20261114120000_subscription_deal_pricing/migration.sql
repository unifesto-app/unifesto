-- T6: plan payments record the price they bought (before proration credit) and
-- the deal they were sold under. Additive; existing rows stay null and are
-- credited at the price in force, exactly as before.
ALTER TABLE "subscription_history" ADD COLUMN "price_paise" INTEGER;
ALTER TABLE "subscription_history" ADD COLUMN "deal_id" UUID;
