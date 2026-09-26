-- Retire the legacy space/event role vocabulary.
--
-- The platform is fully on the SPACE_ADMIN / CURATOR / CO_CURATOR / CREW model.
-- This migration remaps every remaining assignment off the legacy codes and
-- then removes the legacy `roles` rows and their capability grants.
--
--   ORGANISER, CO_ORGANISER      -> SPACE_ADMIN
--   VOLUNTEER (space-level)       -> MEMBER      (event_id IS NULL)
--   VOLUNTEER (event-level)       -> CREW        (event_id IS NOT NULL)
--
-- Order matters: user_roles.role_id -> roles.id is ON DELETE CASCADE, so we MUST
-- remap the assignments BEFORE deleting the legacy roles, or the memberships
-- would be cascade-deleted.
--
-- The user_roles unique index is (user_id, role_id, space_id, event_id). Remaps
-- can therefore collide two ways: a legacy row landing on an existing target row
-- (same scope), or two legacy rows collapsing onto the same target. Each remap
-- clears both kinds of collision before the UPDATE. `IS NOT DISTINCT FROM` is
-- used so NULL space_id / event_id compare equal.

-- ===========================================================================
-- 1) ORGANISER / CO_ORGANISER -> SPACE_ADMIN
-- ===========================================================================

-- 1a) Drop legacy rows whose target (SPACE_ADMIN, same scope) already exists.
DELETE FROM user_roles ur
USING roles r_old
WHERE ur.role_id = r_old.id
  AND r_old.code IN ('ORGANISER', 'CO_ORGANISER')
  AND EXISTS (
    SELECT 1
    FROM user_roles ex
    JOIN roles r_new ON r_new.id = ex.role_id
    WHERE r_new.code = 'SPACE_ADMIN'
      AND ex.user_id = ur.user_id
      AND ex.space_id IS NOT DISTINCT FROM ur.space_id
      AND ex.event_id IS NOT DISTINCT FROM ur.event_id
  );

-- 1b) Collapse duplicate legacy rows within the same scope, keeping the oldest.
DELETE FROM user_roles ur
USING (
  SELECT ctid,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, space_id, event_id
           ORDER BY created_at ASC, ctid ASC
         ) AS rn
  FROM user_roles
  WHERE role_id IN (SELECT id FROM roles WHERE code IN ('ORGANISER', 'CO_ORGANISER'))
) d
WHERE ur.ctid = d.ctid
  AND d.rn > 1;

-- 1c) Remap the survivors.
UPDATE user_roles ur
SET role_id = (SELECT id FROM roles WHERE code = 'SPACE_ADMIN' LIMIT 1)
FROM roles r_old
WHERE ur.role_id = r_old.id
  AND r_old.code IN ('ORGANISER', 'CO_ORGANISER');

-- ===========================================================================
-- 2) VOLUNTEER (space-level, event_id IS NULL) -> MEMBER
-- ===========================================================================

DELETE FROM user_roles ur
USING roles r_old
WHERE ur.role_id = r_old.id
  AND r_old.code = 'VOLUNTEER'
  AND ur.event_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM user_roles ex
    JOIN roles r_new ON r_new.id = ex.role_id
    WHERE r_new.code = 'MEMBER'
      AND ex.user_id = ur.user_id
      AND ex.space_id IS NOT DISTINCT FROM ur.space_id
      AND ex.event_id IS NULL
  );

UPDATE user_roles ur
SET role_id = (SELECT id FROM roles WHERE code = 'MEMBER' LIMIT 1)
FROM roles r_old
WHERE ur.role_id = r_old.id
  AND r_old.code = 'VOLUNTEER'
  AND ur.event_id IS NULL;

-- ===========================================================================
-- 3) VOLUNTEER (event-level, event_id IS NOT NULL) -> CREW
-- ===========================================================================

DELETE FROM user_roles ur
USING roles r_old
WHERE ur.role_id = r_old.id
  AND r_old.code = 'VOLUNTEER'
  AND ur.event_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM user_roles ex
    JOIN roles r_new ON r_new.id = ex.role_id
    WHERE r_new.code = 'CREW'
      AND ex.user_id = ur.user_id
      AND ex.event_id IS NOT DISTINCT FROM ur.event_id
  );

UPDATE user_roles ur
SET role_id = (SELECT id FROM roles WHERE code = 'CREW' LIMIT 1)
FROM roles r_old
WHERE ur.role_id = r_old.id
  AND r_old.code = 'VOLUNTEER'
  AND ur.event_id IS NOT NULL;

-- ===========================================================================
-- 4) Remove legacy capability grants (both global and per-space overrides).
--    These key off the RoleCode enum string, not a FK, so they are cleared
--    explicitly.
-- ===========================================================================

DELETE FROM role_capabilities
WHERE role_code IN ('ORGANISER', 'CO_ORGANISER', 'VOLUNTEER');

DELETE FROM space_role_capabilities
WHERE role_code IN ('ORGANISER', 'CO_ORGANISER', 'VOLUNTEER');

-- ===========================================================================
-- 5) Remove the now-unreferenced legacy role rows. All assignments have been
--    remapped above, so nothing cascades.
-- ===========================================================================

DELETE FROM roles
WHERE code IN ('ORGANISER', 'CO_ORGANISER', 'VOLUNTEER');

-- Note: the `role_code` enum still carries ORGANISER / CO_ORGANISER / VOLUNTEER
-- values. Postgres cannot drop enum values without recreating the type, which
-- is risky for a still-referenced enum; the values are left dead and unused.
