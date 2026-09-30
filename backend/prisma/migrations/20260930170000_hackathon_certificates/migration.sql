-- Hackathon mode, Phase 6 (docs/hackathon-mobile-plan.md §9.2): winner
-- certificates remember the award they're for (fills {awardTitle}, and is part
-- of the dedup key so a team with two awards gets two). Additive only.

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "award_id" UUID;

-- AlterTable
ALTER TABLE "certificate_batches" ADD COLUMN     "award_id" UUID;

