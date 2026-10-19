-- D14: action cards on Assist bot messages.
ALTER TABLE "support_messages" ADD COLUMN "actions" JSONB;
