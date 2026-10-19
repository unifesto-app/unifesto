-- Assist D7: host one event without a Space.
CREATE TABLE "event_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "type" "event_type" NOT NULL DEFAULT 'IN_PERSON',
    "start_date_time" TIMESTAMPTZ(6) NOT NULL,
    "end_date_time" TIMESTAMPTZ(6) NOT NULL,
    "city" VARCHAR(100),
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "review_note" TEXT,
    "reviewed_by" UUID,
    "space_id" UUID,
    "event_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "event_requests_user_id_idx" ON "event_requests"("user_id");
CREATE INDEX "event_requests_status_idx" ON "event_requests"("status");

ALTER TABLE "event_requests" ADD CONSTRAINT "event_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
