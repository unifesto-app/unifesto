-- Refund requests: two-stage approval (attendee → organiser → admin).
-- Only the base amount (ticket price) is refundable; the processing fee is kept.
-- Partial refunds are supported and tracked cumulatively per registration.

-- New partial-refund payment state. Ordered before REFUNDED to match the schema
-- enum order. Not referenced elsewhere in this migration, so it is safe inside
-- the migration transaction on PostgreSQL 12+.
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED' BEFORE 'REFUNDED';

-- Enums
CREATE TYPE refund_status AS ENUM ('PENDING_ORGANISER', 'PENDING_ADMIN', 'APPROVED', 'REJECTED');
CREATE TYPE refund_requester_role AS ENUM ('ATTENDEE', 'ORGANISER');

-- Cumulative base amount refunded so far on a registration (drives PARTIALLY_REFUNDED vs REFUNDED)
ALTER TABLE event_registrations
  ADD COLUMN refunded_amount DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- Refund requests
CREATE TABLE refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  requested_by_id UUID NOT NULL REFERENCES users(id),
  requester_role refund_requester_role NOT NULL,
  support_ticket_id UUID REFERENCES support_tickets(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  requested_amount DECIMAL(10, 2),
  status refund_status NOT NULL DEFAULT 'PENDING_ORGANISER',
  organiser_note TEXT,
  organiser_action_by UUID,
  organiser_action_at TIMESTAMPTZ,
  admin_note TEXT,
  admin_action_by UUID,
  admin_action_at TIMESTAMPTZ,
  approved_amount DECIMAL(10, 2),
  cash_refunded DECIMAL(10, 2) NOT NULL DEFAULT 0,
  coins_refunded INTEGER NOT NULL DEFAULT 0,
  razorpay_refund_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX refund_requests_registration_id_idx ON refund_requests(registration_id);
CREATE INDEX refund_requests_event_id_idx ON refund_requests(event_id);
CREATE INDEX refund_requests_status_idx ON refund_requests(status);
