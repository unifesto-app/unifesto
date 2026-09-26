-- Two changes:
--   1. `has_sessions` plan/model feature flag, gating the Sessions feature.
--   2. `space_ownership_requests` — a creator handing a space to another
--      member, subject to admin approval.

-- AlterTable
ALTER TABLE "plan_configs"
    ADD COLUMN "has_sessions" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "billing_model_configs"
    ADD COLUMN "has_sessions" BOOLEAN NOT NULL DEFAULT false;

-- Sessions shipped ungated, so switching the flag on by default would cut off
-- organisers mid-use. Turn it on for exactly those plans and billing models
-- that already have sessions running under them; everything else starts off
-- and can be granted deliberately from the admin Subscriptions page.
UPDATE "plan_configs" pc
SET "has_sessions" = true
WHERE EXISTS (
    SELECT 1
    FROM "sessions" s
    JOIN "spaces" sp ON sp."id" = s."space_id"
    JOIN "org_subscriptions" os ON os."user_id" = sp."created_by"
    WHERE os."plan" = pc."plan"
);

UPDATE "billing_model_configs" bmc
SET "has_sessions" = true
WHERE EXISTS (
    SELECT 1
    FROM "sessions" s
    JOIN "spaces" sp ON sp."id" = s."space_id"
    JOIN "org_subscriptions" os ON os."user_id" = sp."created_by"
    WHERE os."billing_model" = bmc."billing_model"
);

-- CreateTable
CREATE TABLE "space_ownership_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "space_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "new_owner_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "review_note" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "space_ownership_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "space_ownership_requests_space_id_idx" ON "space_ownership_requests"("space_id");

-- CreateIndex
CREATE INDEX "space_ownership_requests_requested_by_idx" ON "space_ownership_requests"("requested_by");

-- CreateIndex
CREATE INDEX "space_ownership_requests_new_owner_id_idx" ON "space_ownership_requests"("new_owner_id");

-- CreateIndex
CREATE INDEX "space_ownership_requests_status_idx" ON "space_ownership_requests"("status");

-- AddForeignKey
ALTER TABLE "space_ownership_requests" ADD CONSTRAINT "space_ownership_requests_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_ownership_requests" ADD CONSTRAINT "space_ownership_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_ownership_requests" ADD CONSTRAINT "space_ownership_requests_new_owner_id_fkey" FOREIGN KEY ("new_owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
