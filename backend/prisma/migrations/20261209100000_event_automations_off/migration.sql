-- C18: automatic messages switched off for one event.

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "automations_off" TEXT[] DEFAULT ARRAY[]::TEXT[];

