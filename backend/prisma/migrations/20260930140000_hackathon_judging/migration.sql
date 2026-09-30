-- Hackathon mode, Phase 3 (docs/hackathon-mobile-plan.md §6.3–6.5, §7, §8):
-- round settings, judge profiles, panels, the evaluation queue, and the
-- 5-minute edit lock on judgments. Additive only: no drops, no backfill.

-- CreateEnum
CREATE TYPE "hackathon_judging_mode" AS ENUM ('SINGLE', 'PANEL', 'MULTI');

-- CreateEnum
CREATE TYPE "hackathon_eval_status" AS ENUM ('WAITING', 'CALLED', 'IN_PROGRESS', 'AWAITING_MARKS', 'COMPLETED', 'NO_SHOW', 'WITHDRAWN', 'CANCELLED');

-- AlterTable
ALTER TABLE "leaderboard_rounds" ADD COLUMN     "call_grace_minutes" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "counts_toward_total" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "elimination_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "judging_mode" "hackathon_judging_mode" NOT NULL DEFAULT 'SINGLE',
ADD COLUMN     "required_evaluations" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "slot_minutes" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "leaderboard_judgments" ADD COLUMN     "reopened_at" TIMESTAMPTZ(6),
ADD COLUMN     "reopened_by" UUID,
ADD COLUMN     "request_id" UUID;

-- CreateTable
CREATE TABLE "hackathon_judge_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leaderboard_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "theme_ids" UUID[],
    "location" VARCHAR(200),
    "meeting_url" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hackathon_judge_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hackathon_panels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leaderboard_id" UUID NOT NULL,
    "round_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "location" VARCHAR(200),
    "meeting_url" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hackathon_panels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hackathon_panel_members" (
    "panel_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hackathon_panel_members_pkey" PRIMARY KEY ("panel_id","user_id")
);

-- CreateTable
CREATE TABLE "hackathon_eval_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leaderboard_id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "entrant_id" UUID NOT NULL,
    "judge_user_id" UUID,
    "panel_id" UUID,
    "status" "hackathon_eval_status" NOT NULL DEFAULT 'WAITING',
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "called_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "slot_ends_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "closed_reason" VARCHAR(40),
    "closed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hackathon_eval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leaderboard_judgments_request_id_idx" ON "leaderboard_judgments"("request_id");

-- CreateIndex
CREATE INDEX "hackathon_judge_profiles_user_id_idx" ON "hackathon_judge_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "hackathon_judge_profiles_leaderboard_id_user_id_key" ON "hackathon_judge_profiles"("leaderboard_id", "user_id");

-- CreateIndex
CREATE INDEX "hackathon_panels_leaderboard_id_idx" ON "hackathon_panels"("leaderboard_id");

-- CreateIndex
CREATE INDEX "hackathon_panels_round_id_idx" ON "hackathon_panels"("round_id");

-- CreateIndex
CREATE UNIQUE INDEX "hackathon_panels_leaderboard_id_name_key" ON "hackathon_panels"("leaderboard_id", "name");

-- CreateIndex
CREATE INDEX "hackathon_panel_members_user_id_idx" ON "hackathon_panel_members"("user_id");

-- CreateIndex
CREATE INDEX "hackathon_eval_requests_leaderboard_id_status_idx" ON "hackathon_eval_requests"("leaderboard_id", "status");

-- CreateIndex
CREATE INDEX "hackathon_eval_requests_judge_user_id_status_requested_at_idx" ON "hackathon_eval_requests"("judge_user_id", "status", "requested_at");

-- CreateIndex
CREATE INDEX "hackathon_eval_requests_panel_id_status_requested_at_idx" ON "hackathon_eval_requests"("panel_id", "status", "requested_at");

-- CreateIndex
CREATE INDEX "hackathon_eval_requests_entrant_id_round_id_idx" ON "hackathon_eval_requests"("entrant_id", "round_id");

-- CreateIndex
CREATE INDEX "hackathon_eval_requests_round_id_status_idx" ON "hackathon_eval_requests"("round_id", "status");

-- One open request per team (plan §3 #7). Hand-written: Prisma can't express
-- a partial unique index, so it isn't in schema.prisma.
CREATE UNIQUE INDEX "hackathon_eval_requests_one_open_per_team" ON "hackathon_eval_requests"("entrant_id")
    WHERE "status" IN ('WAITING', 'CALLED', 'IN_PROGRESS', 'AWAITING_MARKS');

-- AddForeignKey
ALTER TABLE "leaderboard_judgments" ADD CONSTRAINT "leaderboard_judgments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "hackathon_eval_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_judge_profiles" ADD CONSTRAINT "hackathon_judge_profiles_leaderboard_id_fkey" FOREIGN KEY ("leaderboard_id") REFERENCES "leaderboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_panels" ADD CONSTRAINT "hackathon_panels_leaderboard_id_fkey" FOREIGN KEY ("leaderboard_id") REFERENCES "leaderboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_panels" ADD CONSTRAINT "hackathon_panels_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "leaderboard_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_panel_members" ADD CONSTRAINT "hackathon_panel_members_panel_id_fkey" FOREIGN KEY ("panel_id") REFERENCES "hackathon_panels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_eval_requests" ADD CONSTRAINT "hackathon_eval_requests_leaderboard_id_fkey" FOREIGN KEY ("leaderboard_id") REFERENCES "leaderboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_eval_requests" ADD CONSTRAINT "hackathon_eval_requests_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "leaderboard_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_eval_requests" ADD CONSTRAINT "hackathon_eval_requests_entrant_id_fkey" FOREIGN KEY ("entrant_id") REFERENCES "leaderboard_entrants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_eval_requests" ADD CONSTRAINT "hackathon_eval_requests_panel_id_fkey" FOREIGN KEY ("panel_id") REFERENCES "hackathon_panels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
