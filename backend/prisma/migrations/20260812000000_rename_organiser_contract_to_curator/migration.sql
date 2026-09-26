-- Rename legacy "organiser" contract vocabulary to the curator role model.
--
-- Only enum VALUES are stored in the database, so only they need a migration.
-- The model/field renames (OrganiserBankAccount -> PayoutBankAccount,
-- coOrganisers -> coCurators, organiserNote -> curatorNote, ...) keep their
-- @map/@@map, so the underlying tables and columns are unchanged and produce
-- no SQL here.
--
-- ALTER TYPE ... RENAME VALUE is atomic and rewrites no rows: Postgres stores
-- enum labels by OID reference, so every existing row follows the rename.

ALTER TYPE "refund_status" RENAME VALUE 'PENDING_ORGANISER' TO 'PENDING_CURATOR';

ALTER TYPE "refund_requester_role" RENAME VALUE 'ORGANISER' TO 'CURATOR';
