-- F4: user suspension/ban + per-user capability overrides.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "suspended_at" TIMESTAMPTZ(6),
ADD COLUMN     "suspended_by" UUID,
ADD COLUMN     "suspended_until" TIMESTAMPTZ(6),
ADD COLUMN     "suspension_reason" TEXT;

-- CreateTable
CREATE TABLE "user_capability_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "allow" BOOLEAN NOT NULL,
    "space_id" UUID,
    "reason" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_capability_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_capability_overrides_user_id_idx" ON "user_capability_overrides"("user_id");

-- AddForeignKey
ALTER TABLE "user_capability_overrides" ADD CONSTRAINT "user_capability_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_capability_overrides" ADD CONSTRAINT "user_capability_overrides_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

