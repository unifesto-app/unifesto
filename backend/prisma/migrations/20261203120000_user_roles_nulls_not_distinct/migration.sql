-- T12: one user_roles row per grant.
--
-- The unique on (user_id, role_id, space_id, event_id) treats NULLs as
-- distinct, so it never stopped a second identical platform row (both ids
-- NULL), space row (event_id NULL) or event row (space_id NULL). Init's
-- 3-column unique (user_id, role_id, space_id) was kept as a stopgap for space
-- rows (20260703 dropped "unique_user_role_space", a db-push name the history
-- never had, so the init index survived and has been pinned in known-drift.sql
-- since). Needs Postgres 15+ for NULLS NOT DISTINCT.
--
-- contract-step: deletes duplicate rows. A duplicate matches its twin on user,
-- role, space and event, so it grants nothing extra; the oldest row of each
-- group is kept (its assigned_by/created_at are the original grant). Nothing
-- references user_roles.id.

DELETE FROM "user_roles" d
USING "user_roles" k
WHERE d.user_id = k.user_id
  AND d.role_id = k.role_id
  AND d.space_id IS NOT DISTINCT FROM k.space_id
  AND d.event_id IS NOT DISTINCT FROM k.event_id
  AND (k.created_at, k.id) < (d.created_at, d.id);

-- The 4-column unique under whichever name and form this database has it: the
-- 20260703 constraint, J19's rename of it, or a db-push plain index.
ALTER TABLE "user_roles" DROP CONSTRAINT IF EXISTS "unique_user_role_scope";
ALTER TABLE "user_roles" DROP CONSTRAINT IF EXISTS "user_roles_user_id_role_id_space_id_event_id_key";
DROP INDEX IF EXISTS "unique_user_role_scope";
DROP INDEX IF EXISTS "user_roles_user_id_role_id_space_id_event_id_key";

CREATE UNIQUE INDEX "user_roles_user_id_role_id_space_id_event_id_key"
  ON "user_roles"("user_id", "role_id", "space_id", "event_id") NULLS NOT DISTINCT;

-- Init's 3-column unique is now covered (space rows have event_id NULL).
ALTER TABLE "user_roles" DROP CONSTRAINT IF EXISTS "user_roles_user_id_role_id_space_id_key";
DROP INDEX IF EXISTS "user_roles_user_id_role_id_space_id_key";
