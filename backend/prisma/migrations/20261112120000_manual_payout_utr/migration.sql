-- A32: manual payouts record who marked them paid, when, and a UTR that is
-- unique per payout. Additive only.
ALTER TABLE "payouts" ADD COLUMN "paid_by_id" UUID;
ALTER TABLE "payouts" ADD COLUMN "paid_at" TIMESTAMPTZ(6);

-- One UTR per payout, case-insensitive. Scoped to payouts marked paid under the
-- new rule (paid_by_id set), so older free-text UTRs never block the migration.
CREATE UNIQUE INDEX "payouts_paid_utr_key" ON "payouts" (UPPER("utr")) WHERE "paid_by_id" IS NOT NULL;
