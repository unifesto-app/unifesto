-- Completely remove the GATE role code that was added to the database out-of-band.
-- Postgres does not support dropping a value from an enum, so we recreate the
-- "role_code" enum without GATE and swap the column over.

-- 1. Delete any role assignments and role rows using GATE (if present).
--    Compare on the column cast to text (`code::text = 'GATE'`) rather than the
--    enum literal `code = 'GATE'`: GATE was only ever added out-of-band in prod,
--    so on a fresh replay the enum has no GATE value and coercing the literal
--    'GATE' to role_code errors (22P02). Text comparison matches the prod rows
--    when present and simply matches nothing on a clean DB.
DELETE FROM "user_roles"
WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "code"::text = 'GATE');

DELETE FROM "roles" WHERE "code"::text = 'GATE';

-- 2. Rebuild the enum without GATE.
ALTER TYPE "role_code" RENAME TO "role_code_old";

CREATE TYPE "role_code" AS ENUM ('ADMIN', 'ORGANISER', 'CO_ORGANISER', 'MEMBER', 'VOLUNTEER');

ALTER TABLE "roles"
  ALTER COLUMN "code" TYPE "role_code"
  USING ("code"::text::"role_code");

DROP TYPE "role_code_old";
