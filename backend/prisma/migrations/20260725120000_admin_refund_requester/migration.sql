-- Admin-initiated refunds: an admin can raise and settle a refund directly,
-- so the requester-role audit trail needs an ADMIN value alongside
-- ATTENDEE and ORGANISER.
ALTER TYPE "refund_requester_role" ADD VALUE IF NOT EXISTS 'ADMIN';
