-- F1: per-event attendee feedback (rating, NPS, curator questions).
-- AlterTable
ALTER TABLE "events" ADD COLUMN     "feedback_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "event_feedback_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "type" "form_field_type" NOT NULL,
    "options" TEXT[],
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "help_text" VARCHAR(500),
    "config" JSONB,
    "show_if" JSONB,

    CONSTRAINT "event_feedback_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_feedback_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "nps" SMALLINT,
    "comment" TEXT,
    "answers" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_feedback_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_feedback_questions_event_id_idx" ON "event_feedback_questions"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_feedback_responses_event_id_user_id_key" ON "event_feedback_responses"("event_id", "user_id");

-- AddForeignKey
ALTER TABLE "event_feedback_questions" ADD CONSTRAINT "event_feedback_questions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_feedback_responses" ADD CONSTRAINT "event_feedback_responses_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_feedback_responses" ADD CONSTRAINT "event_feedback_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

