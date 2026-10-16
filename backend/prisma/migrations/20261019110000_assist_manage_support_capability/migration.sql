-- D2: seed the new `space:manage-support` capability (work the space's Assist
-- desk) for CURATOR + CO_CURATOR into role_capabilities. REQUIRED, not cosmetic:
-- CapabilityConfigService treats a role's DB rows as authoritative, so without
-- this seed the compiled grant is shadowed. SPACE_ADMIN gets it by inheritance
-- (event-scoped action); CREW is off by default and can be enabled per space.
INSERT INTO "role_capabilities" ("role_code", "action", "updated_at") VALUES
    ('CURATOR', 'space:manage-support', CURRENT_TIMESTAMP),
    ('CO_CURATOR', 'space:manage-support', CURRENT_TIMESTAMP)
ON CONFLICT ("role_code", "action") DO NOTHING;

-- Spaces that already customised CURATOR / CO_CURATOR hold an authoritative
-- override set; add the new default there too so those teams don't silently
-- lose it. A space can still turn it off in its IAM console.
INSERT INTO "space_role_capabilities" ("space_id", "role_code", "action", "updated_at")
SELECT DISTINCT "space_id", "role_code", 'space:manage-support', CURRENT_TIMESTAMP
FROM "space_role_capabilities"
WHERE "role_code" IN ('CURATOR', 'CO_CURATOR')
ON CONFLICT ("space_id", "role_code", "action") DO NOTHING;
