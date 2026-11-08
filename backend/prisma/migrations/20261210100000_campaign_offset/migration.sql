-- C18: campaigns timed to their event's start.

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "offset_minutes" INTEGER;

