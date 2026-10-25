-- T4/T5: negotiated terms per space or event, and which deal priced each sale.
-- Additive only. With no deal rows nothing changes: every sale is priced from
-- the rate card exactly as before, and the A21 trigger still stamps
-- platform_fee_percent at payment. A sale under a deal with its own organiser
-- fee is written with platform_fee_percent already set, which the trigger
-- never overwrites.

CREATE TABLE "deals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "space_id" UUID NOT NULL,
    "event_id" UUID,
    "plan" "org_plan",
    "plan_price_paise" INTEGER,
    "billing_cycle" "billing_cycle",
    "buyer_fee_bps" INTEGER,
    "organiser_fee_bps" INTEGER,
    "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(6),
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "deals_plan_price_paise_check" CHECK ("plan_price_paise" IS NULL OR "plan_price_paise" >= 0),
    CONSTRAINT "deals_buyer_fee_bps_check" CHECK ("buyer_fee_bps" IS NULL OR "buyer_fee_bps" BETWEEN 0 AND 10000),
    CONSTRAINT "deals_organiser_fee_bps_check" CHECK ("organiser_fee_bps" IS NULL OR "organiser_fee_bps" BETWEEN 0 AND 10000)
);
CREATE INDEX "deals_space_id_idx" ON "deals"("space_id");
ALTER TABLE "deals" ADD CONSTRAINT "deals_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_registrations" ADD COLUMN "deal_id" UUID;
ALTER TABLE "group_seat_purchases" ADD COLUMN "deal_id" UUID;
ALTER TABLE "session_registrations" ADD COLUMN "deal_id" UUID;
ALTER TABLE "stay_bookings" ADD COLUMN "deal_id" UUID;
