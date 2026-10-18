-- B19: a certificate revoked for cause stays revoked through re-runs and
-- "Reissue all"; a template with issued certificates is retired, not deleted.
ALTER TABLE "certificates" ADD COLUMN "revoked_for_cause" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "certificate_templates" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

-- Existing revocations with a reason were individual, for-cause ones.
UPDATE "certificates" SET "revoked_for_cause" = true
WHERE "status" = 'REVOKED' AND "revoked_reason" IS NOT NULL AND "revoked_reason" <> '';
