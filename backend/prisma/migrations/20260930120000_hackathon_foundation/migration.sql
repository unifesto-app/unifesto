-- Hackathon mode, Phase 1 (docs/hackathon-mobile-plan.md §6, §13 phase 1):
-- hackathon config on the board, team fields on entrants (Team ID, name
-- source, cancellation stamp, room), rooms, and the in-app notification feed.
-- Additive only: no drops, no destructive ALTERs, no backfill.

-- CreateEnum
CREATE TYPE "hackathon_ps_mode" AS ENUM ('TEAM_WRITES', 'TEAM_PICKS', 'CURATOR_ASSIGNS');

-- CreateEnum
CREATE TYPE "hackathon_theme_mode" AS ENUM ('LIST', 'TEXT');

-- CreateEnum
CREATE TYPE "hackathon_scoring_mode" AS ENUM ('PER_ROUND', 'CUMULATIVE');

-- CreateEnum
CREATE TYPE "hackathon_team_name_source" AS ENUM ('FORM', 'LEAD', 'CURATOR', 'DEFAULT');

-- AlterTable
ALTER TABLE "leaderboards" ADD COLUMN     "is_hackathon" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ps_deadline" TIMESTAMPTZ(6),
ADD COLUMN     "ps_mode" "hackathon_ps_mode",
ADD COLUMN     "scoring_mode" "hackathon_scoring_mode" NOT NULL DEFAULT 'PER_ROUND',
ADD COLUMN     "team_code_digits" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "team_code_next" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "team_code_prefix" VARCHAR(20),
ADD COLUMN     "team_name_field_id" UUID,
ADD COLUMN     "theme_mode" "hackathon_theme_mode" NOT NULL DEFAULT 'LIST',
ADD COLUMN     "venue_address" TEXT,
ADD COLUMN     "venue_lat" DOUBLE PRECISION,
ADD COLUMN     "venue_lng" DOUBLE PRECISION,
ADD COLUMN     "venue_map_url" TEXT,
ADD COLUMN     "venue_name" VARCHAR(255),
ADD COLUMN     "venue_notes" TEXT;

-- AlterTable
ALTER TABLE "leaderboard_entrants" ADD COLUMN     "cancelled_at" TIMESTAMPTZ(6),
ADD COLUMN     "room_id" UUID,
ADD COLUMN     "team_code" VARCHAR(40),
ADD COLUMN     "team_name_source" "hackathon_team_name_source",
ADD COLUMN     "team_seq" INTEGER;

-- CreateTable
CREATE TABLE "user_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "event_id" UUID,
    "type" VARCHAR(40) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "deep_link" TEXT,
    "data" JSONB,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hackathon_rooms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leaderboard_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "location" VARCHAR(200),
    "capacity" INTEGER NOT NULL,
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hackathon_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_notifications_user_id_created_at_idx" ON "user_notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "user_notifications_user_id_event_id_read_at_idx" ON "user_notifications"("user_id", "event_id", "read_at");

-- CreateIndex
CREATE INDEX "hackathon_rooms_leaderboard_id_idx" ON "hackathon_rooms"("leaderboard_id");

-- CreateIndex
CREATE UNIQUE INDEX "hackathon_rooms_leaderboard_id_name_key" ON "hackathon_rooms"("leaderboard_id", "name");

-- CreateIndex
CREATE INDEX "leaderboard_entrants_room_id_idx" ON "leaderboard_entrants"("room_id");

-- CreateIndex
CREATE UNIQUE INDEX "leaderboard_entrants_leaderboard_id_team_code_key" ON "leaderboard_entrants"("leaderboard_id", "team_code");

-- AddForeignKey
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_entrants" ADD CONSTRAINT "leaderboard_entrants_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "hackathon_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_rooms" ADD CONSTRAINT "hackathon_rooms_leaderboard_id_fkey" FOREIGN KEY ("leaderboard_id") REFERENCES "leaderboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

