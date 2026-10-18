-- A25: a failed refund is still owed, so it stays the registration's one open
-- request (no second request for the same money). Separate migration: a new
-- enum value can't be used in the transaction that adds it.
DROP INDEX IF EXISTS "refund_requests_one_open_per_registration";
CREATE UNIQUE INDEX "refund_requests_one_open_per_registration"
  ON "refund_requests" ("registration_id")
  WHERE "status" IN ('PENDING_CURATOR', 'PENDING_ADMIN', 'PROCESSING', 'REFUND_FAILED');
