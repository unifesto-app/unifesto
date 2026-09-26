-- Competitive Dashboard (hack.unifesto.app)
--
-- Adds the leaderboard aggregate (board → metrics + entrants → scores), the
-- event-scoped JUDGE role, and the has_leaderboard plan-capability flag.
--
-- NOTE on `ALTER TYPE ... ADD VALUE`: allowed inside a transaction on
-- PostgreSQL 12+. The new value is not USED anywhere in this migration, so the
-- "cannot use a new enum value in the same transaction" rule does not apply.

-- CreateEnum
CREATE TYPE "leaderboard_mode" AS ENUM ('RUBRIC', 'METRIC');

-- CreateEnum
CREATE TYPE "leaderboard_entrant_kind" AS ENUM ('TEAM', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "leaderboard_visibility" AS ENUM ('PUBLIC', 'PARTICIPANTS_ONLY');

-- CreateEnum
CREATE TYPE "leaderboard_status" AS ENUM ('DRAFT', 'LIVE', 'FROZEN', 'FINAL');

-- CreateEnum
CREATE TYPE "leaderboard_tie_break" AS ENUM ('EARLIEST_SUBMISSION', 'PRIMARY_METRIC');

-- AlterEnum
ALTER TYPE "role_code" ADD VALUE 'JUDGE';

-- AlterTable
ALTER TABLE "plan_configs" ADD COLUMN "has_leaderboard" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "billing_model_configs" ADD COLUMN "has_leaderboard" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "leaderboards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "mode" "leaderboard_mode" NOT NULL,
    "entrant_kind" "leaderboard_entrant_kind" NOT NULL DEFAULT 'TEAM',
    "visibility" "leaderboard_visibility" NOT NULL DEFAULT 'PARTICIPANTS_ONLY',
    "status" "leaderboard_status" NOT NULL DEFAULT 'DRAFT',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "title" VARCHAR(200),
    "description" TEXT,
    "tie_break" "leaderboard_tie_break" NOT NULL DEFAULT 'EARLIEST_SUBMISSION',
    "tie_break_metric_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leaderboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboard_metrics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leaderboard_id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "weight" DECIMAL(6,3) NOT NULL DEFAULT 1,
    "min_value" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "max_value" DECIMAL(12,3) NOT NULL DEFAULT 100,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leaderboard_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboard_entrants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leaderboard_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "registration_id" UUID,
    "user_id" UUID,
    "meta" JSONB,
    "total_score" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leaderboard_entrants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboard_scores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entrant_id" UUID NOT NULL,
    "metric_id" UUID NOT NULL,
    "judge_user_id" UUID,
    "value" DECIMAL(12,3) NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leaderboard_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leaderboards_event_id_key" ON "leaderboards"("event_id");

-- CreateIndex
CREATE INDEX "leaderboard_metrics_leaderboard_id_idx" ON "leaderboard_metrics"("leaderboard_id");

-- CreateIndex
CREATE UNIQUE INDEX "leaderboard_metrics_leaderboard_id_key_key" ON "leaderboard_metrics"("leaderboard_id", "key");

-- CreateIndex
CREATE INDEX "leaderboard_entrants_leaderboard_id_idx" ON "leaderboard_entrants"("leaderboard_id");

-- CreateIndex
CREATE INDEX "leaderboard_entrants_registration_id_idx" ON "leaderboard_entrants"("registration_id");

-- CreateIndex
CREATE INDEX "leaderboard_scores_entrant_id_idx" ON "leaderboard_scores"("entrant_id");

-- CreateIndex
CREATE INDEX "leaderboard_scores_metric_id_idx" ON "leaderboard_scores"("metric_id");

-- CreateIndex
CREATE INDEX "leaderboard_scores_judge_user_id_idx" ON "leaderboard_scores"("judge_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "leaderboard_scores_entrant_id_metric_id_judge_user_id_key" ON "leaderboard_scores"("entrant_id", "metric_id", "judge_user_id");

-- CreateIndex
-- Postgres treats NULLs as DISTINCT in a normal unique index, so the composite
-- unique above does NOT stop two organiser-entered rows (judge_user_id IS NULL)
-- for the same cell. This partial unique index enforces one such row per cell.
CREATE UNIQUE INDEX "leaderboard_scores_metric_cell_uniq" ON "leaderboard_scores"("entrant_id", "metric_id") WHERE "judge_user_id" IS NULL;

-- AddForeignKey
ALTER TABLE "leaderboards" ADD CONSTRAINT "leaderboards_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_metrics" ADD CONSTRAINT "leaderboard_metrics_leaderboard_id_fkey" FOREIGN KEY ("leaderboard_id") REFERENCES "leaderboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_entrants" ADD CONSTRAINT "leaderboard_entrants_leaderboard_id_fkey" FOREIGN KEY ("leaderboard_id") REFERENCES "leaderboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_scores" ADD CONSTRAINT "leaderboard_scores_entrant_id_fkey" FOREIGN KEY ("entrant_id") REFERENCES "leaderboard_entrants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_scores" ADD CONSTRAINT "leaderboard_scores_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "leaderboard_metrics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
