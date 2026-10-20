-- Track U1: seed the EMPLOYEE role row and its default capabilities.
--
-- The capability seed is REQUIRED, not cosmetic: CapabilityConfigService treats
-- a role's DB rows as authoritative once any exist, and the IAM console edits
-- these rows. company:view-restricted is off by default; platform:manage and
-- company:manage are refused for EMPLOYEE by setGrant. ADMIN holds every
-- company/product action by inheritance, so it needs no rows. Idempotent.
INSERT INTO "roles" ("code", "name", "scope")
VALUES ('EMPLOYEE', 'Employee', 'PLATFORM')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_capabilities" ("role_code", "action", "updated_at") VALUES
    ('EMPLOYEE', 'company:view', CURRENT_TIMESTAMP),
    ('EMPLOYEE', 'company:edit', CURRENT_TIMESTAMP),
    ('EMPLOYEE', 'product:view', CURRENT_TIMESTAMP),
    ('EMPLOYEE', 'product:edit', CURRENT_TIMESTAMP)
ON CONFLICT ("role_code", "action") DO NOTHING;
