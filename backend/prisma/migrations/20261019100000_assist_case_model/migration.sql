-- D1: support_tickets becomes the Assist case (no rename); messages get a side.
-- Additive only: support_messages.is_staff_reply stays and is still written.

ALTER TYPE "support_ticket_status" ADD VALUE IF NOT EXISTS 'BOT' BEFORE 'OPEN';

CREATE TYPE "support_case_kind" AS ENUM ('HELP', 'REFUND', 'CANCELLATION', 'REQUEST', 'REPORT', 'PRIVACY', 'GRIEVANCE');
CREATE TYPE "support_desk" AS ENUM ('SPACE', 'PLATFORM');
CREATE TYPE "support_message_side" AS ENUM ('REQUESTER', 'DESK', 'ASSISTANT', 'SYSTEM');

ALTER TABLE "support_tickets"
  ADD COLUMN "kind" "support_case_kind" NOT NULL DEFAULT 'HELP',
  ADD COLUMN "request_type" VARCHAR(60),
  ADD COLUMN "desk" "support_desk" NOT NULL DEFAULT 'PLATFORM',
  ADD COLUMN "subject_type" VARCHAR(40),
  ADD COLUMN "subject_id" UUID,
  ADD COLUMN "event_id" UUID,
  ADD COLUMN "registration_id" UUID,
  ADD COLUMN "escalated_at" TIMESTAMPTZ(6),
  ADD COLUMN "first_response_at" TIMESTAMPTZ(6),
  ADD COLUMN "requester_last_read_at" TIMESTAMPTZ(6),
  ADD COLUMN "desk_last_read_at" TIMESTAMPTZ(6),
  ADD COLUMN "rating" SMALLINT,
  ADD COLUMN "ai_triage" JSONB,
  ADD COLUMN "ai_summary" TEXT;

ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_registration_id_fkey"
  FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "support_tickets_desk_status_idx" ON "support_tickets"("desk", "status");
CREATE INDEX "support_tickets_event_id_idx" ON "support_tickets"("event_id");
CREATE INDEX "support_tickets_subject_type_subject_id_idx" ON "support_tickets"("subject_type", "subject_id");

ALTER TABLE "support_messages"
  ADD COLUMN "side" "support_message_side" NOT NULL DEFAULT 'REQUESTER',
  ADD COLUMN "internal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ai_drafted" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: staff replies are the desk side.
UPDATE "support_messages" SET "side" = 'DESK' WHERE "is_staff_reply" = true;

-- Backfill: first staff reply = first response.
UPDATE "support_tickets" t SET "first_response_at" = m.first_at
FROM (
  SELECT "ticket_id", MIN("created_at") AS first_at
  FROM "support_messages" WHERE "is_staff_reply" = true
  GROUP BY "ticket_id"
) m
WHERE m."ticket_id" = t."id";

-- Backfill: tickets linked from a refund request wrap that request.
UPDATE "support_tickets" t SET
  "kind" = 'REFUND',
  "subject_type" = 'RefundRequest',
  "subject_id" = r."id",
  "event_id" = r."event_id",
  "registration_id" = r."registration_id"
FROM (
  SELECT DISTINCT ON ("support_ticket_id") "id", "support_ticket_id", "event_id", "registration_id"
  FROM "refund_requests" WHERE "support_ticket_id" IS NOT NULL
  ORDER BY "support_ticket_id", "created_at" DESC
) r
WHERE r."support_ticket_id" = t."id";
