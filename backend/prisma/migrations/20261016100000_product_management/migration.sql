-- CreateEnum
CREATE TYPE "PmTaskStatus" AS ENUM ('NEXT', 'PLANNED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'PARKED', 'DROPPED');

-- CreateTable
CREATE TABLE "pm_tracks" (
    "key" VARCHAR(16) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pm_tracks_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "pm_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(32) NOT NULL,
    "track_key" VARCHAR(16) NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" "PmTaskStatus" NOT NULL DEFAULT 'PLANNED',
    "owner" VARCHAR(80),
    "due_date" DATE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pm_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pm_activity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID,
    "actor" VARCHAR(160) NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pm_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pm_api_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(80) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pm_api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pm_tasks_key_key" ON "pm_tasks"("key");

-- CreateIndex
CREATE INDEX "pm_tasks_track_key_sort_order_idx" ON "pm_tasks"("track_key", "sort_order");

-- CreateIndex
CREATE INDEX "pm_tasks_status_idx" ON "pm_tasks"("status");

-- CreateIndex
CREATE INDEX "pm_activity_created_at_idx" ON "pm_activity"("created_at");

-- CreateIndex
CREATE INDEX "pm_activity_task_id_created_at_idx" ON "pm_activity"("task_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pm_api_tokens_token_hash_key" ON "pm_api_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "pm_api_tokens_user_id_idx" ON "pm_api_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "pm_tasks" ADD CONSTRAINT "pm_tasks_track_key_fkey" FOREIGN KEY ("track_key") REFERENCES "pm_tracks"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_activity" ADD CONSTRAINT "pm_activity_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "pm_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

