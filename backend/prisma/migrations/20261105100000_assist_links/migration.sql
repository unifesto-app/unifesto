-- D26 + D27: link a WhatsApp conversation / hackathon help query to the Assist case it became. Additive only.
ALTER TABLE "whatsapp_conversations" ADD COLUMN "case_id" UUID;
ALTER TABLE "hackathon_help_queries" ADD COLUMN "escalated_at" TIMESTAMPTZ(6),
                                     ADD COLUMN "case_id" UUID;
