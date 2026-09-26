-- Group members each get their own certificate.
--
-- A GROUP registration is one row whose whole team lives in `group_members`
-- and whose single account is the team lead's. Keying certificates on
-- (template, user) therefore collapsed an entire team into one certificate.
-- Add `member_index` (the member's slot in the group) and drop the
-- (template, user) unique so a team can hold many certificates off one
-- registration. Uniqueness is now enforced in the issuance code by
-- (template, registration, member_index).

-- DropIndex (the old one-per-user-per-template unique)
DROP INDEX IF EXISTS "certificates_template_id_user_id_key";

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN "member_index" INTEGER;

-- CreateIndex (supports the dedup lookup by template)
CREATE INDEX "certificates_template_id_idx" ON "certificates"("template_id");
