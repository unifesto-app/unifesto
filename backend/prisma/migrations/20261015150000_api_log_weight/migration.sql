-- S27: sampled 2xx GETs carry a weight so counts stay unbiased; composite
-- indexes serve the log viewer's filter + newest-first ordering.
ALTER TABLE "api_logs" ADD COLUMN "weight" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "api_logs_status_code_created_at_idx" ON "api_logs"("status_code", "created_at");
CREATE INDEX "api_logs_user_id_created_at_idx" ON "api_logs"("user_id", "created_at");
