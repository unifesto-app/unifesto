-- Add EVENT scope and VOLUNTEER role code
ALTER TYPE "role_scope" ADD VALUE IF NOT EXISTS 'EVENT';
ALTER TYPE "role_code" ADD VALUE IF NOT EXISTS 'VOLUNTEER';

-- Add event context to user_roles
ALTER TABLE "user_roles" ADD COLUMN "event_id" UUID;

-- Replace the space-only uniqueness constraint with a scope-aware one
ALTER TABLE "user_roles" DROP CONSTRAINT IF EXISTS "unique_user_role_space";
ALTER TABLE "user_roles"
  ADD CONSTRAINT "unique_user_role_scope" UNIQUE ("user_id", "role_id", "space_id", "event_id");

-- Index + foreign key for event context
CREATE INDEX "user_roles_event_id_idx" ON "user_roles"("event_id");

ALTER TABLE "user_roles"
  ADD CONSTRAINT "user_roles_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
