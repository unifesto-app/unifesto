-- D4: files on Assist messages. Private S3 keys, served by signed URL only.

CREATE TABLE "support_attachments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "message_id" UUID NOT NULL,
  "key" VARCHAR(300) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "mime" VARCHAR(100) NOT NULL,
  "size" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_attachments_message_id_idx" ON "support_attachments"("message_id");

ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "support_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
