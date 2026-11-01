-- AI19: a flagged broadcast from an Unverified space waits for staff. Additive only.
ALTER TYPE "email_campaign_status" ADD VALUE IF NOT EXISTS 'HELD';
ALTER TYPE "push_campaign_status" ADD VALUE IF NOT EXISTS 'HELD';

CREATE TYPE "broadcast_kind" AS ENUM ('EMAIL', 'PUSH', 'HACKATHON');
CREATE TYPE "broadcast_hold_status" AS ENUM ('HELD', 'RELEASED', 'BLOCKED');

CREATE TABLE "broadcast_holds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "broadcast_kind" NOT NULL,
    "ref_id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "event_id" UUID,
    "preview" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "payload" JSONB,
    "status" "broadcast_hold_status" NOT NULL DEFAULT 'HELD',
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcast_holds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "broadcast_holds_kind_ref_id_key" ON "broadcast_holds"("kind", "ref_id");
