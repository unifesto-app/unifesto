-- AI9: tag each AI call with its space and whether it counts toward the
-- space's plan (AI17), and index the per-feature 24-hour spend lookup.
ALTER TABLE "ai_runs" ADD COLUMN "space_id" UUID,
ADD COLUMN "billable" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "ai_runs_feature_created_at_idx" ON "ai_runs"("feature", "created_at");
