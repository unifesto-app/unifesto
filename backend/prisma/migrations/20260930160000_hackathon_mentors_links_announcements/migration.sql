-- Hackathon mode, Phase 5 (docs/hackathon-mobile-plan.md §3 #17, §6.3–6.4, §10):
-- mentoring rounds (round kind) and mentors (judge profile kind), project
-- links per team per round (with an optional cut-off), and curator
-- announcements. Additive only: no drops, no backfill.

-- CreateEnum
CREATE TYPE "hackathon_round_kind" AS ENUM ('EVALUATION', 'MENTORING');

-- CreateEnum
CREATE TYPE "hackathon_announcement_audience" AS ENUM ('ALL', 'TEAMS', 'JUDGES', 'ROOM');

-- AlterTable
ALTER TABLE "leaderboard_rounds" ADD COLUMN     "kind" "hackathon_round_kind" NOT NULL DEFAULT 'EVALUATION',
ADD COLUMN     "submissions_close_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "hackathon_judge_profiles" ADD COLUMN     "kind" "leaderboard_panelist_kind" NOT NULL DEFAULT 'JUDGE';

-- CreateTable
CREATE TABLE "hackathon_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entrant_id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "links" JSONB NOT NULL,
    "notes" TEXT,
    "submitted_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hackathon_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hackathon_announcements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leaderboard_id" UUID NOT NULL,
    "audience" "hackathon_announcement_audience" NOT NULL,
    "room_id" UUID,
    "room_name" VARCHAR(120),
    "title" VARCHAR(120) NOT NULL,
    "body" TEXT NOT NULL,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hackathon_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hackathon_submissions_round_id_idx" ON "hackathon_submissions"("round_id");

-- CreateIndex
CREATE UNIQUE INDEX "hackathon_submissions_entrant_id_round_id_key" ON "hackathon_submissions"("entrant_id", "round_id");

-- CreateIndex
CREATE INDEX "hackathon_announcements_leaderboard_id_created_at_idx" ON "hackathon_announcements"("leaderboard_id", "created_at");

-- AddForeignKey
ALTER TABLE "hackathon_submissions" ADD CONSTRAINT "hackathon_submissions_entrant_id_fkey" FOREIGN KEY ("entrant_id") REFERENCES "leaderboard_entrants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_submissions" ADD CONSTRAINT "hackathon_submissions_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "leaderboard_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_announcements" ADD CONSTRAINT "hackathon_announcements_leaderboard_id_fkey" FOREIGN KEY ("leaderboard_id") REFERENCES "leaderboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

