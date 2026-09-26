-- Feature: manual + bulk attendee management.
--
-- Adds the `event:manage-attendees` capability — the gate for manually adding a
-- single attendee (optionally with a Razorpay payment link) and bulk-importing
-- a roster from CSV. Curators and Co-Curators get it; Space Admins already reach
-- every event action except money through the inheritance rule in
-- AuthorizationService, so they are NOT seeded here.
--
-- This seed is REQUIRED, not cosmetic: CapabilityConfigService only falls back
-- to the compiled matrix when a role has ZERO rows in role_capabilities. The IAM
-- console already seeded every current role, so without this insert Curators /
-- Co-Curators would be silently denied the new action. ON CONFLICT keeps it
-- idempotent and safe to re-run.
INSERT INTO "role_capabilities" ("role_code", "action", "updated_at") VALUES
    ('CURATOR', 'event:manage-attendees', CURRENT_TIMESTAMP),
    ('CO_CURATOR', 'event:manage-attendees', CURRENT_TIMESTAMP)
ON CONFLICT ("role_code", "action") DO NOTHING;

-- Per-space overrides: a space that has CUSTOMISED one of these event roles has
-- its own authoritative row-set (materialise-on-customise), so the global seed
-- above never reaches it. Preserve intent by granting manage-attendees to any
-- customised (space, role) that already grants event:edit — i.e. roles the space
-- trusts to run the event. Roles the space explicitly reduced to view/check-in
-- only are left untouched.
INSERT INTO "space_role_capabilities" ("space_id", "role_code", "action", "updated_at")
SELECT DISTINCT src.space_id, src.role_code, 'event:manage-attendees', CURRENT_TIMESTAMP
FROM "space_role_capabilities" src
WHERE src.role_code IN ('CURATOR', 'CO_CURATOR')
  AND src.action = 'event:edit'
ON CONFLICT ("space_id", "role_code", "action") DO NOTHING;
