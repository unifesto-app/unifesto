-- Hackathon mode, Phase 4 (docs/hackathon-mobile-plan.md §9, §2 #20 #32):
-- notes on awards, and the capability to declare / publish winners, granted
-- to Curators only (Space Admins inherit every event action; Co-Curators
-- don't get it). Additive only.

-- AlterTable
ALTER TABLE "leaderboard_awards" ADD COLUMN     "notes" TEXT;

-- Seed the new capability in the global matrix.
INSERT INTO "role_capabilities" ("role_code", "action", "updated_at") VALUES
    ('CURATOR', 'event:declare-hackathon-winners', CURRENT_TIMESTAMP)
ON CONFLICT ("role_code", "action") DO NOTHING;

-- Spaces that customised the Curator role keep their Curators able to declare
-- winners (a customised role only has the actions it has rows for).
INSERT INTO "space_role_capabilities" ("space_id", "role_code", "action", "updated_at")
SELECT DISTINCT "space_id", "role_code", 'event:declare-hackathon-winners', CURRENT_TIMESTAMP
FROM "space_role_capabilities"
WHERE "role_code" = 'CURATOR'
ON CONFLICT ("space_id", "role_code", "action") DO NOTHING;
