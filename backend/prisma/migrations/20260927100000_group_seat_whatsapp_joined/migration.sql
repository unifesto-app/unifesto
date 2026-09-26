-- 4.0.5 (5.3d): group members see the WhatsApp join card on their own ticket
-- and mark it joined per seat. Additive, nullable.
ALTER TABLE "group_seats" ADD COLUMN "whatsapp_joined_at" TIMESTAMPTZ(6);
