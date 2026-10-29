-- F3: opt-in public rating on the event page.
-- AlterTable
ALTER TABLE "events" ADD COLUMN     "feedback_public" BOOLEAN NOT NULL DEFAULT false;

