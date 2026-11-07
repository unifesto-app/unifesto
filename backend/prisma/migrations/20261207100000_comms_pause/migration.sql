-- C17: the Apex brake on bulk sends.

-- AlterTable
ALTER TABLE "platform_config" ADD COLUMN     "comms_paused" BOOLEAN NOT NULL DEFAULT false;

