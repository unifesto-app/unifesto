-- WhatsApp inbox: persist two-way conversations on the Business number.
--
-- Inbound messages (Meta webhook) and outbound admin replies are stored so the
-- Apex "WhatsApp" page can list conversations and reply within Meta's 24h
-- customer-service window.

-- CreateEnum
CREATE TYPE "whatsapp_message_direction" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateTable: whatsapp_conversations
CREATE TABLE "whatsapp_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wa_id" VARCHAR(20) NOT NULL,
    "profile_name" VARCHAR(255),
    "user_id" UUID,
    "last_inbound_at" TIMESTAMPTZ(6),
    "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversations_wa_id_key" ON "whatsapp_conversations"("wa_id");
CREATE INDEX "whatsapp_conversations_last_message_at_idx" ON "whatsapp_conversations"("last_message_at");
CREATE INDEX "whatsapp_conversations_user_id_idx" ON "whatsapp_conversations"("user_id");

-- CreateTable: whatsapp_messages
CREATE TABLE "whatsapp_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "direction" "whatsapp_message_direction" NOT NULL,
    "wa_message_id" VARCHAR(128),
    "type" VARCHAR(32) NOT NULL DEFAULT 'text',
    "body" TEXT,
    "media_note" TEXT,
    "media_url" TEXT,
    "sent_by_id" UUID,
    "status" VARCHAR(32),
    "error_text" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_wa_message_id_key" ON "whatsapp_messages"("wa_message_id");
CREATE INDEX "whatsapp_messages_conversation_id_created_at_idx" ON "whatsapp_messages"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "whatsapp_messages"
  ADD CONSTRAINT "whatsapp_messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
