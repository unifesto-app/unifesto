-- DropIndex
DROP INDEX "api_logs_path_prefix_idx";

-- DropIndex
DROP INDEX "user_roles_user_id_role_id_space_id_key";

-- CreateIndex
CREATE INDEX "api_logs_path_prefix_idx" ON "api_logs"("path" text_pattern_ops);

