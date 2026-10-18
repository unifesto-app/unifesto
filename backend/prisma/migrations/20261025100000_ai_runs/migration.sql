-- D12: AI foundation. Every Claude call is logged in ai_runs (cost, tokens,
-- outcome; the per-user daily caps count these rows). AI features run only
-- while listed in platform_config.ai_enabled_features (the kill switch).

-- CreateEnum
CREATE TYPE "AiRunOutcome" AS ENUM ('OK', 'REFUSED', 'ERROR');

-- CreateTable
CREATE TABLE "ai_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "feature" VARCHAR(32) NOT NULL,
    "model" VARCHAR(64) NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_write_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL,
    "outcome" "AiRunOutcome" NOT NULL,
    "user_id" UUID,
    "subject" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_runs_user_id_feature_created_at_idx" ON "ai_runs"("user_id", "feature", "created_at");

-- CreateIndex
CREATE INDEX "ai_runs_created_at_idx" ON "ai_runs"("created_at");

-- AlterTable
ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "ai_enabled_features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
