-- Hackathon mode, Phase 2 (docs/hackathon-mobile-plan.md §6, §13 phase 2):
-- themes, problem statements, and each team's chosen statement + theme with
-- its lock (the gate to judging). Additive only: no drops, no backfill.

-- AlterTable
ALTER TABLE "leaderboards" ADD COLUMN     "ps_deadline_reminded_for" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "leaderboard_entrants" ADD COLUMN     "custom_statement_text" TEXT,
ADD COLUMN     "custom_statement_title" VARCHAR(200),
ADD COLUMN     "statement_changed_after_eval_at" TIMESTAMPTZ(6),
ADD COLUMN     "statement_id" UUID,
ADD COLUMN     "statement_locked_at" TIMESTAMPTZ(6),
ADD COLUMN     "statement_set_by" UUID,
ADD COLUMN     "theme_id" UUID,
ADD COLUMN     "theme_text" VARCHAR(60);

-- CreateTable
CREATE TABLE "hackathon_themes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leaderboard_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hackathon_themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hackathon_statements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leaderboard_id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "theme_id" UUID,
    "max_teams" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hackathon_statements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hackathon_themes_leaderboard_id_idx" ON "hackathon_themes"("leaderboard_id");

-- CreateIndex
CREATE UNIQUE INDEX "hackathon_themes_leaderboard_id_name_key" ON "hackathon_themes"("leaderboard_id", "name");

-- CreateIndex
CREATE INDEX "hackathon_statements_leaderboard_id_idx" ON "hackathon_statements"("leaderboard_id");

-- CreateIndex
CREATE INDEX "hackathon_statements_theme_id_idx" ON "hackathon_statements"("theme_id");

-- CreateIndex
CREATE UNIQUE INDEX "hackathon_statements_leaderboard_id_code_key" ON "hackathon_statements"("leaderboard_id", "code");

-- CreateIndex
CREATE INDEX "leaderboard_entrants_statement_id_idx" ON "leaderboard_entrants"("statement_id");

-- CreateIndex
CREATE INDEX "leaderboard_entrants_theme_id_idx" ON "leaderboard_entrants"("theme_id");

-- AddForeignKey
ALTER TABLE "leaderboard_entrants" ADD CONSTRAINT "leaderboard_entrants_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "hackathon_statements"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_entrants" ADD CONSTRAINT "leaderboard_entrants_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "hackathon_themes"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_themes" ADD CONSTRAINT "hackathon_themes_leaderboard_id_fkey" FOREIGN KEY ("leaderboard_id") REFERENCES "leaderboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_statements" ADD CONSTRAINT "hackathon_statements_leaderboard_id_fkey" FOREIGN KEY ("leaderboard_id") REFERENCES "leaderboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_statements" ADD CONSTRAINT "hackathon_statements_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "hackathon_themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

