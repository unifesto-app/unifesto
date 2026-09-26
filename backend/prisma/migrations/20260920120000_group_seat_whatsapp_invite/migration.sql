-- Per-seat WhatsApp group-invite send tracking, so each group member is invited
-- once. The lead (seat 1) is tracked on the registration row instead.
ALTER TABLE "group_seats"
  ADD COLUMN "whatsapp_invite_sent_at" TIMESTAMPTZ(6);
