-- Account deletion: a request with a 30-day grace period, then a soft close
-- (PII is scrubbed in app code; the row stays for financial records).
ALTER TABLE "users" ADD COLUMN "deletion_requested_at" TIMESTAMPTZ(6);
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

CREATE INDEX "users_deletion_requested_at_idx" ON "users"("deletion_requested_at");
