-- DropIndex
DROP INDEX "api_logs_path_prefix_idx";

-- CreateIndex
CREATE INDEX "api_logs_path_prefix_idx" ON "api_logs"("path" text_pattern_ops);

