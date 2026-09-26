-- Hackathon Dashboards — Phase 1 (rounds, panels, reviews, advancement, awards).
--
-- Extends the existing `leaderboard` aggregate from a single-round scoring board
-- into a multi-round competition with per-round panels (judges/mentors),
-- per-criterion comments + overall reviews, MANUAL advancement/elimination, and
-- named awards — plus the `event:manage-leaderboard` capability and the MENTOR
-- role. Additive; existing boards (if any) are migrated to one implicit round.
--
-- NOTE on `ALTER TYPE ... ADD VALUE`: allowed inside a transaction on
-- PostgreSQL 12+. The new 'MENTOR' value is NOT used in this migration (the
-- `roles` row for it is seeded in a FOLLOW-UP migration), so the "cannot use a
-- new enum value in the same transaction" rule does not apply — mirroring how
-- 'JUDGE' was added then seeded separately.

-- AlterEnum: new event-scoped reviewer role.
ALTER TYPE "role_code" ADD VALUE 'MENTOR';

-- CreateEnum
CREATE TYPE "leaderboard_round_status" AS ENUM ('PENDING', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "leaderboard_entrant_round_status" AS ENUM ('PENDING', 'ADVANCED', 'ELIMINATED');

-- CreateEnum
CREATE TYPE "leaderboard_panelist_kind" AS ENUM ('JUDGE', 'MENTOR');

-- AlterTable: curator toggle that opens written feedback to participants.
ALTER TABLE "leaderboards" ADD COLUMN "reveal_reviews" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: criteria may differ per round (null = board-level / all rounds).
ALTER TABLE "leaderboard_metrics" ADD COLUMN "round_id" UUID;

-- CreateTable: rounds.
CREATE TABLE "leaderboard_rounds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leaderboard_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "order" INTEGER NOT NULL,
    "status" "leaderboard_round_status" NOT NULL DEFAULT 'PENDING',
    "start_at" TIMESTAMPTZ(6),
    "end_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leaderboard_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable: per-entrant, per-round standing — drives the attendee bracket.
CREATE TABLE "leaderboard_entrant_rounds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entrant_id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "status" "leaderboard_entrant_round_status" NOT NULL DEFAULT 'PENDING',
    "round_score" DECIMAL(14,4),
    "rank" INTEGER,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leaderboard_entrant_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable: panel assignment (judge/mentor scope), separate from UserRole.
CREATE TABLE "leaderboard_panelists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leaderboard_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "leaderboard_panelist_kind" NOT NULL,
    "round_id" UUID,
    "entrant_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leaderboard_panelists_pkey" PRIMARY KEY ("id")
);

-- CreateTable: review + completion tracking (one per panelist/entrant/round).
CREATE TABLE "leaderboard_judgments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entrant_id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "panelist_user_id" UUID NOT NULL,
    "kind" "leaderboard_panelist_kind" NOT NULL,
    "overall_review" TEXT,
    "submitted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leaderboard_judgments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: named awards (winners).
CREATE TABLE "leaderboard_awards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leaderboard_id" UUID NOT NULL,
    "entrant_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "declared_by" UUID,
    "declared_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leaderboard_awards_pkey" PRIMARY KEY ("id")
);

-- Indexes / unique constraints for the new tables.
CREATE UNIQUE INDEX "leaderboard_rounds_leaderboard_id_order_key" ON "leaderboard_rounds"("leaderboard_id", "order");
CREATE INDEX "leaderboard_rounds_leaderboard_id_idx" ON "leaderboard_rounds"("leaderboard_id");

CREATE UNIQUE INDEX "leaderboard_entrant_rounds_entrant_id_round_id_key" ON "leaderboard_entrant_rounds"("entrant_id", "round_id");
CREATE INDEX "leaderboard_entrant_rounds_round_id_idx" ON "leaderboard_entrant_rounds"("round_id");

CREATE UNIQUE INDEX "leaderboard_panelists_scope_uniq" ON "leaderboard_panelists"("leaderboard_id", "user_id", "round_id", "entrant_id");
CREATE INDEX "leaderboard_panelists_leaderboard_id_idx" ON "leaderboard_panelists"("leaderboard_id");
CREATE INDEX "leaderboard_panelists_user_id_idx" ON "leaderboard_panelists"("user_id");

CREATE UNIQUE INDEX "leaderboard_judgments_entrant_id_round_id_panelist_user_id_key" ON "leaderboard_judgments"("entrant_id", "round_id", "panelist_user_id");
CREATE INDEX "leaderboard_judgments_round_id_idx" ON "leaderboard_judgments"("round_id");
CREATE INDEX "leaderboard_judgments_panelist_user_id_idx" ON "leaderboard_judgments"("panelist_user_id");

CREATE UNIQUE INDEX "leaderboard_awards_leaderboard_id_title_key" ON "leaderboard_awards"("leaderboard_id", "title");
CREATE INDEX "leaderboard_awards_leaderboard_id_idx" ON "leaderboard_awards"("leaderboard_id");
CREATE INDEX "leaderboard_awards_entrant_id_idx" ON "leaderboard_awards"("entrant_id");

CREATE INDEX "leaderboard_metrics_round_id_idx" ON "leaderboard_metrics"("round_id");

-- Foreign keys (all cascade WITHIN the aggregate; user refs stay soft).
ALTER TABLE "leaderboard_rounds" ADD CONSTRAINT "leaderboard_rounds_leaderboard_id_fkey" FOREIGN KEY ("leaderboard_id") REFERENCES "leaderboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "leaderboard_entrant_rounds" ADD CONSTRAINT "leaderboard_entrant_rounds_entrant_id_fkey" FOREIGN KEY ("entrant_id") REFERENCES "leaderboard_entrants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leaderboard_entrant_rounds" ADD CONSTRAINT "leaderboard_entrant_rounds_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "leaderboard_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "leaderboard_panelists" ADD CONSTRAINT "leaderboard_panelists_leaderboard_id_fkey" FOREIGN KEY ("leaderboard_id") REFERENCES "leaderboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leaderboard_panelists" ADD CONSTRAINT "leaderboard_panelists_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "leaderboard_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leaderboard_panelists" ADD CONSTRAINT "leaderboard_panelists_entrant_id_fkey" FOREIGN KEY ("entrant_id") REFERENCES "leaderboard_entrants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "leaderboard_judgments" ADD CONSTRAINT "leaderboard_judgments_entrant_id_fkey" FOREIGN KEY ("entrant_id") REFERENCES "leaderboard_entrants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leaderboard_judgments" ADD CONSTRAINT "leaderboard_judgments_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "leaderboard_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "leaderboard_awards" ADD CONSTRAINT "leaderboard_awards_leaderboard_id_fkey" FOREIGN KEY ("leaderboard_id") REFERENCES "leaderboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leaderboard_awards" ADD CONSTRAINT "leaderboard_awards_entrant_id_fkey" FOREIGN KEY ("entrant_id") REFERENCES "leaderboard_entrants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "leaderboard_metrics" ADD CONSTRAINT "leaderboard_metrics_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "leaderboard_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Migrate existing boards to one implicit round ─────────────────────────────
-- Per the plan the feature is greenfield (no live board data). This backfill is
-- a safety net so any existing dev/staging board keeps working: give every board
-- a "Round 1" and point its existing scores at it. Metrics stay round-null
-- (board-level), which is valid.
INSERT INTO "leaderboard_rounds" ("leaderboard_id", "name", "order", "status", "updated_at")
SELECT "id", 'Round 1', 1, 'ACTIVE', CURRENT_TIMESTAMP FROM "leaderboards";

-- Add the round column to scores, backfill from the board's Round 1, then lock
-- it NOT NULL. Also add the per-criterion comment column.
ALTER TABLE "leaderboard_scores" ADD COLUMN "round_id" UUID;
ALTER TABLE "leaderboard_scores" ADD COLUMN "comment" TEXT;

UPDATE "leaderboard_scores" s
SET "round_id" = r."id"
FROM "leaderboard_entrants" e
JOIN "leaderboard_rounds" r
  ON r."leaderboard_id" = e."leaderboard_id" AND r."order" = 1
WHERE s."entrant_id" = e."id";

ALTER TABLE "leaderboard_scores" ALTER COLUMN "round_id" SET NOT NULL;

ALTER TABLE "leaderboard_scores" ADD CONSTRAINT "leaderboard_scores_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "leaderboard_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill an ENTRANT_ROUND row for every (entrant, Round 1) so the bracket has
-- a standing to show for pre-existing entrants.
INSERT INTO "leaderboard_entrant_rounds" ("entrant_id", "round_id", "status", "updated_at")
SELECT e."id", r."id", 'PENDING', CURRENT_TIMESTAMP
FROM "leaderboard_entrants" e
JOIN "leaderboard_rounds" r
  ON r."leaderboard_id" = e."leaderboard_id" AND r."order" = 1;

-- ── Rework the score uniqueness to be round-scoped ────────────────────────────
-- Old constraint keyed on (entrant, metric, judge); a cell is now also scoped by
-- round. The partial index (organiser-entered METRIC cells, judge_user_id NULL)
-- likewise gains round_id.
DROP INDEX "leaderboard_scores_entrant_id_metric_id_judge_user_id_key";
CREATE UNIQUE INDEX "leaderboard_scores_cell_round_uniq" ON "leaderboard_scores"("entrant_id", "metric_id", "judge_user_id", "round_id");

DROP INDEX "leaderboard_scores_metric_cell_uniq";
CREATE UNIQUE INDEX "leaderboard_scores_metric_cell_round_uniq" ON "leaderboard_scores"("entrant_id", "metric_id", "round_id") WHERE "judge_user_id" IS NULL;

-- ── Seed the new capability ───────────────────────────────────────────────────
-- `event:manage-leaderboard` gates board/round/panel/entrant/award management.
-- REQUIRED (not cosmetic): CapabilityConfigService treats a role's existing DB
-- rows as authoritative and only falls back to the compiled matrix when a role
-- has ZERO rows, so without this seed the compiled grant would be shadowed.
--
-- Seeded only for the EVENT-scoped roles CURATOR / CO_CURATOR (NOT CREW).
-- SPACE_ADMIN is SPACE-scoped and reaches event actions through the inheritance
-- rule in AuthorizationService (every event action except money), so a direct
-- event-action row for it would be unused and un-editable in the IAM console.
-- Idempotent.
INSERT INTO "role_capabilities" ("role_code", "action", "updated_at") VALUES
    ('CURATOR', 'event:manage-leaderboard', CURRENT_TIMESTAMP),
    ('CO_CURATOR', 'event:manage-leaderboard', CURRENT_TIMESTAMP)
ON CONFLICT ("role_code", "action") DO NOTHING;
