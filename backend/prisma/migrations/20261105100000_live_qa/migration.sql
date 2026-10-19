-- L2: live Q&A during events. Additive only: one enum, two tables, one
-- defaulted column. One upvote per person is the unique (question_id, user_id).

-- AlterTable
ALTER TABLE "events" ADD COLUMN "qa_premoderated" BOOLEAN NOT NULL DEFAULT true;

-- CreateEnum
CREATE TYPE "question_status" AS ENUM ('PENDING', 'APPROVED', 'HIDDEN', 'ANSWERED');

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "agenda_id" UUID,
    "user_id" UUID NOT NULL,
    "text" VARCHAR(500) NOT NULL,
    "status" "question_status" NOT NULL DEFAULT 'PENDING',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "answered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_votes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "questions_event_id_status_idx" ON "questions"("event_id", "status");

-- CreateIndex
CREATE INDEX "questions_event_id_user_id_created_at_idx" ON "questions"("event_id", "user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "question_votes_question_id_user_id_key" ON "question_votes"("question_id", "user_id");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_agenda_id_fkey" FOREIGN KEY ("agenda_id") REFERENCES "event_agenda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_votes" ADD CONSTRAINT "question_votes_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_votes" ADD CONSTRAINT "question_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
