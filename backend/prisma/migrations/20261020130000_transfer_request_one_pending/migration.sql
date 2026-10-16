-- S52: at most one PENDING transfer request per registration. The service
-- checks first, but check-then-insert races (two curators clicking at once).
-- Pre-deploy: this must return 0 rows, else reject the extras by hand first:
--   SELECT registration_id, count(*) FROM registration_transfer_requests
--     WHERE status = 'PENDING' GROUP BY 1 HAVING count(*) > 1;
CREATE UNIQUE INDEX "registration_transfer_requests_one_pending"
  ON "registration_transfer_requests" ("registration_id")
  WHERE "status" = 'PENDING';
