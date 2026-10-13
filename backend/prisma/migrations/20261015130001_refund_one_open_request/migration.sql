-- S11: at most one open refund request per registration. The service already
-- checks, but check-then-insert races. PROCESSING counts as open.
-- Pre-deploy: run the duplicate check from the PR notes; it must return 0 rows.
CREATE UNIQUE INDEX "refund_requests_one_open_per_registration"
  ON "refund_requests" ("registration_id")
  WHERE "status" IN ('PENDING_CURATOR', 'PENDING_ADMIN', 'PROCESSING');
