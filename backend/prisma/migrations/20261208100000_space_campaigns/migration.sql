-- C17 part 3: space and event campaigns, checked once by AI19 across their
-- channels, and the email campaign a campaign made (so it isn't checked twice).

-- AlterEnum
ALTER TYPE "broadcast_kind" ADD VALUE 'CAMPAIGN';

-- AlterTable
ALTER TABLE "email_campaigns" ADD COLUMN     "campaign_id" UUID;

