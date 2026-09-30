-- Hackathon help desk: room volunteers, help topics with POCs, and team
-- queries routed to them. Additive only: no drops, no backfill.

-- CreateEnum
CREATE TYPE "hackathon_help_query_status" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- AlterTable
ALTER TABLE "hackathon_rooms" ADD COLUMN     "volunteer_user_ids" UUID[] DEFAULT ARRAY[]::UUID[];

-- CreateTable
CREATE TABLE "hackathon_help_topics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leaderboard_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "poc_user_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hackathon_help_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hackathon_help_queries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leaderboard_id" UUID NOT NULL,
    "entrant_id" UUID NOT NULL,
    "topic_id" UUID,
    "topic_name" VARCHAR(60) NOT NULL,
    "room_id" UUID,
    "room_name" VARCHAR(120),
    "message" TEXT NOT NULL,
    "status" "hackathon_help_query_status" NOT NULL DEFAULT 'OPEN',
    "raised_by" UUID NOT NULL,
    "notified_user_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "handled_by" UUID,
    "acknowledged_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hackathon_help_queries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hackathon_help_topics_leaderboard_id_idx" ON "hackathon_help_topics"("leaderboard_id");

-- CreateIndex
CREATE UNIQUE INDEX "hackathon_help_topics_leaderboard_id_name_key" ON "hackathon_help_topics"("leaderboard_id", "name");

-- CreateIndex
CREATE INDEX "hackathon_help_queries_leaderboard_id_status_idx" ON "hackathon_help_queries"("leaderboard_id", "status");

-- CreateIndex
CREATE INDEX "hackathon_help_queries_entrant_id_created_at_idx" ON "hackathon_help_queries"("entrant_id", "created_at");

-- CreateIndex
CREATE INDEX "hackathon_help_queries_notified_user_ids_idx" ON "hackathon_help_queries" USING GIN ("notified_user_ids");

-- AddForeignKey
ALTER TABLE "hackathon_help_topics" ADD CONSTRAINT "hackathon_help_topics_leaderboard_id_fkey" FOREIGN KEY ("leaderboard_id") REFERENCES "leaderboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_help_queries" ADD CONSTRAINT "hackathon_help_queries_leaderboard_id_fkey" FOREIGN KEY ("leaderboard_id") REFERENCES "leaderboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_help_queries" ADD CONSTRAINT "hackathon_help_queries_entrant_id_fkey" FOREIGN KEY ("entrant_id") REFERENCES "leaderboard_entrants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_help_queries" ADD CONSTRAINT "hackathon_help_queries_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "hackathon_help_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

