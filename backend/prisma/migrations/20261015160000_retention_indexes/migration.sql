-- S34: indexes for the daily retention sweep (RetentionService), which deletes
-- by age. page_views already has (created_at). Additive only.
CREATE INDEX IF NOT EXISTS "push_logs_created_at_idx" ON "push_logs"("created_at");
CREATE INDEX IF NOT EXISTS "user_notifications_created_at_idx" ON "user_notifications"("created_at");
CREATE INDEX IF NOT EXISTS "email_campaign_logs_sent_at_idx" ON "email_campaign_logs"("sent_at");
CREATE INDEX IF NOT EXISTS "short_link_clicks_created_at_idx" ON "short_link_clicks"("created_at");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_created_at_idx" ON "whatsapp_messages"("created_at");
