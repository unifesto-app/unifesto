-- Team changes: a deadline for lead changes, lead handover requests, and
-- extra seats bought for an existing group.

-- CreateEnum
CREATE TYPE "GroupLeadTransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "team_changes_until" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "group_lead_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "registration_id" UUID NOT NULL,
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "status" "GroupLeadTransferStatus" NOT NULL DEFAULT 'PENDING',
    "by_curator" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(6),

    CONSTRAINT "group_lead_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_seat_purchases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "registration_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "seats" INTEGER NOT NULL,
    "base_amount" DECIMAL(10,2) NOT NULL,
    "processing_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "refunded_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payment_status" "payment_status" NOT NULL DEFAULT 'PENDING',
    "order_id" VARCHAR(255),
    "payment_id" VARCHAR(255),
    "razorpay_refund_id" VARCHAR(100),
    "paid_at" TIMESTAMPTZ(6),
    "seats_added_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "group_seat_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_lead_transfers_registration_id_status_idx" ON "group_lead_transfers"("registration_id", "status");

-- CreateIndex
CREATE INDEX "group_lead_transfers_to_user_id_status_idx" ON "group_lead_transfers"("to_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "group_seat_purchases_order_id_key" ON "group_seat_purchases"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_seat_purchases_payment_id_key" ON "group_seat_purchases"("payment_id");

-- CreateIndex
CREATE INDEX "group_seat_purchases_registration_id_idx" ON "group_seat_purchases"("registration_id");

-- CreateIndex
CREATE INDEX "group_seat_purchases_event_id_payment_status_idx" ON "group_seat_purchases"("event_id", "payment_status");

-- AddForeignKey
ALTER TABLE "group_lead_transfers" ADD CONSTRAINT "group_lead_transfers_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_lead_transfers" ADD CONSTRAINT "group_lead_transfers_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_lead_transfers" ADD CONSTRAINT "group_lead_transfers_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_seat_purchases" ADD CONSTRAINT "group_seat_purchases_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_seat_purchases" ADD CONSTRAINT "group_seat_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- At most one open handover per group.
CREATE UNIQUE INDEX "group_lead_transfers_one_pending" ON "group_lead_transfers"("registration_id") WHERE "status" = 'PENDING';
