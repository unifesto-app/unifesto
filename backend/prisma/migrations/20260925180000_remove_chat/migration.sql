-- Remove the event chat feature entirely (groups, messages, moderation).
-- IF EXISTS throughout: these tables were never created by a tracked migration
-- (provisioned via db push), so some environments may not have them.

DROP TABLE IF EXISTS "chat_moderation_actions";
DROP TABLE IF EXISTS "chat_moderation_flags";
DROP TABLE IF EXISTS "chat_messages";
DROP TABLE IF EXISTS "chat_participants";
DROP TABLE IF EXISTS "chat_groups";

DROP TYPE IF EXISTS "ModerationActionType";
DROP TYPE IF EXISTS "ModerationFlagReason";
DROP TYPE IF EXISTS "ChatMessageType";
DROP TYPE IF EXISTS "ChatMessageStatus";
DROP TYPE IF EXISTS "ChatParticipantRole";
DROP TYPE IF EXISTS "ChatGroupStatus";
DROP TYPE IF EXISTS "ChatGroupType";

ALTER TABLE "notification_settings" DROP COLUMN IF EXISTS "chat_messages";
