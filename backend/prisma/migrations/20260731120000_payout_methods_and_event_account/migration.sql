-- Bank / UPI payout methods + per-event payout account.
--
-- 1. A payout method is now EITHER a bank account OR a UPI handle, chosen by a
--    `method_type` discriminator. The bank columns (account_number, ifsc_code,
--    bank_name) become nullable so a UPI-only method needs none of them; the
--    UPI `upi_id` was already nullable. `account_holder_name` doubles as the
--    UPI payee name, and a linked `mobile_number` is captured for both.
--
-- 2. Events gain `payout_bank_account_id`: an optional default payout
--    destination that may point at a co-organiser's account. Unset falls back
--    to the creator's primary; SET NULL if the referenced account is deleted.

-- CreateEnum
CREATE TYPE "payout_method_type" AS ENUM ('BANK', 'UPI');

-- AlterTable: organiser_bank_accounts
ALTER TABLE "organiser_bank_accounts"
  ADD COLUMN "method_type" "payout_method_type" NOT NULL DEFAULT 'BANK',
  ADD COLUMN "mobile_number" VARCHAR(20),
  ALTER COLUMN "account_number" DROP NOT NULL,
  ALTER COLUMN "ifsc_code" DROP NOT NULL,
  ALTER COLUMN "bank_name" DROP NOT NULL;

-- AlterTable: events
ALTER TABLE "events" ADD COLUMN "payout_bank_account_id" UUID;

-- AddForeignKey
ALTER TABLE "events"
  ADD CONSTRAINT "events_payout_bank_account_id_fkey"
  FOREIGN KEY ("payout_bank_account_id") REFERENCES "organiser_bank_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "events_payout_bank_account_id_idx" ON "events"("payout_bank_account_id");
