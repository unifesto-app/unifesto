-- J19: four tables (and their enums) reached production outside migrations
-- (`db push` era), yet later migrations ALTER them, so the history could not be
-- replayed on an empty database (CI's migration replay + drift check). This
-- recreates them as they stood on 2026-07-10, before the first migration that
-- touches them (20260711000000).
--
-- No-op where they exist: every block is guarded on its table being absent, so
-- production (which has all four) changes nothing, and its enums are only made
-- with their table (payout_type was dropped in prod on 2026-07-29; it must not
-- come back there).

DO $$
BEGIN
  IF to_regclass('public.space_requests') IS NULL THEN
    CREATE TABLE "space_requests" (
      "id" UUID NOT NULL DEFAULT gen_random_uuid(),
      "user_id" UUID NOT NULL,
      "name" VARCHAR(255) NOT NULL,
      "description" TEXT,
      "type" "space_type" NOT NULL DEFAULT 'REGULAR',
      "visibility" "space_visibility" NOT NULL DEFAULT 'PUBLIC',
      "city" VARCHAR(100),
      "state" VARCHAR(100),
      "country" VARCHAR(100) DEFAULT 'India',
      "tags" TEXT[],
      "website_url" TEXT,
      "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      "review_note" TEXT,
      "reviewed_by" UUID,
      "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMPTZ(6) NOT NULL,
      CONSTRAINT "space_requests_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "space_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE INDEX "space_requests_user_id_idx" ON "space_requests"("user_id");
    CREATE INDEX "space_requests_status_idx" ON "space_requests"("status");
  END IF;

  IF to_regclass('public.sub_space_requests') IS NULL THEN
    CREATE TYPE "sub_space_request_type" AS ENUM ('JOIN_SUPER', 'CONVERT_AND_JOIN', 'CONVERT_TO_SUPER');
    CREATE TABLE "sub_space_requests" (
      "id" UUID NOT NULL DEFAULT gen_random_uuid(),
      "request_type" "sub_space_request_type" NOT NULL,
      "sub_space_id" UUID,
      "target_space_id" UUID NOT NULL,
      "requested_by" UUID NOT NULL,
      "reason" TEXT NOT NULL,
      "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      "review_note" TEXT,
      "reviewed_by" UUID,
      "reviewed_at" TIMESTAMPTZ(6),
      "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMPTZ(6) NOT NULL,
      CONSTRAINT "sub_space_requests_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "sub_space_requests_sub_space_id_fkey" FOREIGN KEY ("sub_space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "sub_space_requests_target_space_id_fkey" FOREIGN KEY ("target_space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "sub_space_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
    CREATE INDEX "sub_space_requests_sub_space_id_idx" ON "sub_space_requests"("sub_space_id");
    CREATE INDEX "sub_space_requests_target_space_id_idx" ON "sub_space_requests"("target_space_id");
    CREATE INDEX "sub_space_requests_requested_by_idx" ON "sub_space_requests"("requested_by");
    CREATE INDEX "sub_space_requests_status_idx" ON "sub_space_requests"("status");
  END IF;

  IF to_regclass('public.organiser_bank_accounts') IS NULL THEN
    CREATE TYPE "bank_account_status" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
    CREATE TABLE "organiser_bank_accounts" (
      "id" UUID NOT NULL DEFAULT gen_random_uuid(),
      "user_id" UUID NOT NULL,
      "account_holder_name" VARCHAR(255) NOT NULL,
      "account_number" VARCHAR(50) NOT NULL,
      "ifsc_code" VARCHAR(20) NOT NULL,
      "bank_name" VARCHAR(255) NOT NULL,
      "account_type" VARCHAR(20) NOT NULL DEFAULT 'savings',
      "upi_id" VARCHAR(100),
      "status" "bank_account_status" NOT NULL DEFAULT 'PENDING',
      "verified_at" TIMESTAMPTZ(6),
      "verified_by" UUID,
      "rejection_reason" TEXT,
      "is_primary" BOOLEAN NOT NULL DEFAULT false,
      "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMPTZ(6) NOT NULL,
      CONSTRAINT "organiser_bank_accounts_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "organiser_bank_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE INDEX "organiser_bank_accounts_user_id_idx" ON "organiser_bank_accounts"("user_id");
    CREATE INDEX "organiser_bank_accounts_status_idx" ON "organiser_bank_accounts"("status");
  END IF;

  IF to_regclass('public.payouts') IS NULL THEN
    CREATE TYPE "payout_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');
    CREATE TYPE "payout_type" AS ENUM ('STANDARD', 'INSTANT');
    CREATE TABLE "payouts" (
      "id" UUID NOT NULL DEFAULT gen_random_uuid(),
      "event_id" UUID NOT NULL,
      "user_id" UUID NOT NULL,
      "bank_account_id" UUID NOT NULL,
      "type" "payout_type" NOT NULL DEFAULT 'STANDARD',
      "gross_revenue" DECIMAL(12,2) NOT NULL,
      "platform_fee_percent" DECIMAL(5,2) NOT NULL,
      "platform_fee" DECIMAL(12,2) NOT NULL,
      "instant_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
      "net_amount" DECIMAL(12,2) NOT NULL,
      "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
      "status" "payout_status" NOT NULL DEFAULT 'PENDING',
      "processed_at" TIMESTAMPTZ(6),
      "completed_at" TIMESTAMPTZ(6),
      "failed_at" TIMESTAMPTZ(6),
      "failure_reason" TEXT,
      "utr" VARCHAR(50),
      "created_by" UUID,
      "notes" TEXT,
      "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMPTZ(6) NOT NULL,
      CONSTRAINT "payouts_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "payouts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "payouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "payouts_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "organiser_bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
    CREATE INDEX "payouts_event_id_idx" ON "payouts"("event_id");
    CREATE INDEX "payouts_user_id_idx" ON "payouts"("user_id");
    CREATE INDEX "payouts_status_idx" ON "payouts"("status");
    CREATE INDEX "payouts_scheduled_at_idx" ON "payouts"("scheduled_at");
  END IF;
END $$;
