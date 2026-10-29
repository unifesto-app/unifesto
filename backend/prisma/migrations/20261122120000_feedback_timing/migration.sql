-- F2: feedback request/reminder stamps + feedback unlocks certificate.
-- AlterTable
ALTER TABLE "events" ADD COLUMN     "feedback_reminded_at" TIMESTAMPTZ(6),
ADD COLUMN     "feedback_requested_at" TIMESTAMPTZ(6),
ADD COLUMN     "feedback_unlocks_certificate" BOOLEAN NOT NULL DEFAULT false;

