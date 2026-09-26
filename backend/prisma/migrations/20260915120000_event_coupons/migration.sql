-- KonfHub parity P1: discount / coupon codes (event-scoped).
--
-- A coupon reduces the base ticket amount only; the processing fee is recomputed
-- on the reduced base in application code, so the discount never touches gateway
-- economics. The usage cap is a HARD reservation: `used_count` is atomically
-- incremented when a buyer applies a code at checkout and decremented if that
-- attempt is abandoned, fails, or its reservation lapses, so `usage_limit` is
-- never exceeded under concurrent checkouts. The coupon_redemptions row carries
-- that RESERVED -> CONFIRMED lifecycle.

-- CreateEnum
CREATE TYPE "coupon_discount_type" AS ENUM ('PERCENT', 'FLAT');

-- CreateEnum
CREATE TYPE "coupon_redemption_status" AS ENUM ('RESERVED', 'CONFIRMED');

-- AlterTable: record the coupon applied to a registration inline (like coins_used).
ALTER TABLE "event_registrations"
  ADD COLUMN "coupon_id" UUID,
  ADD COLUMN "coupon_discount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "event_coupons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "description" TEXT,
    "discount_type" "coupon_discount_type" NOT NULL,
    "discount_value" DECIMAL(10,2) NOT NULL,
    "max_discount_amount" DECIMAL(10,2),
    "min_purchase_amount" DECIMAL(10,2),
    "usage_limit" INTEGER,
    "per_user_limit" INTEGER NOT NULL DEFAULT 1,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "applies_to_ticket_type_ids" UUID[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_redemptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "coupon_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "discount_amount" DECIMAL(10,2) NOT NULL,
    "status" "coupon_redemption_status" NOT NULL DEFAULT 'RESERVED',
    "reserved_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_coupons_event_id_idx" ON "event_coupons"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_coupons_event_id_code_key" ON "event_coupons"("event_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemptions_registration_id_key" ON "coupon_redemptions"("registration_id");

-- CreateIndex
CREATE INDEX "coupon_redemptions_coupon_id_idx" ON "coupon_redemptions"("coupon_id");

-- CreateIndex
CREATE INDEX "coupon_redemptions_user_id_idx" ON "coupon_redemptions"("user_id");

-- CreateIndex
CREATE INDEX "coupon_redemptions_status_reserved_until_idx" ON "coupon_redemptions"("status", "reserved_until");

-- AddForeignKey
ALTER TABLE "event_coupons" ADD CONSTRAINT "event_coupons_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "event_coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
