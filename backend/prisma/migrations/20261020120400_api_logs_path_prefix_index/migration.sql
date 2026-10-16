-- S54 (S27 remainder): logs search filters `path LIKE 'prefix%'` (Prisma
-- startsWith). Under a non-C collation a plain btree can't serve that; a
-- text_pattern_ops btree can. Additive; CONCURRENTLY so request-log inserts
-- are not blocked while it builds (must stay the only statement in the file).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "api_logs_path_prefix_idx" ON "api_logs"("path" text_pattern_ops);
