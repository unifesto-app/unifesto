-- Support (ticket-based helpdesk)

-- Enums
CREATE TYPE support_ticket_status AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED');
CREATE TYPE support_ticket_priority AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE support_ticket_category AS ENUM ('GENERAL', 'ACCOUNT', 'PAYMENTS', 'EVENTS', 'TICKETING', 'TECHNICAL', 'OTHER');

-- Tickets
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number SERIAL NOT NULL,
  subject VARCHAR(300) NOT NULL,
  category support_ticket_category NOT NULL DEFAULT 'GENERAL',
  priority support_ticket_priority NOT NULL DEFAULT 'NORMAL',
  status support_ticket_status NOT NULL DEFAULT 'OPEN',
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_email VARCHAR(255),
  space_id UUID REFERENCES spaces(id) ON DELETE SET NULL,
  assigned_to_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX support_tickets_ticket_number_key ON support_tickets(ticket_number);
CREATE INDEX support_tickets_requester_id_idx ON support_tickets(requester_id);
CREATE INDEX support_tickets_space_id_idx ON support_tickets(space_id);
CREATE INDEX support_tickets_assigned_to_id_idx ON support_tickets(assigned_to_id);
CREATE INDEX support_tickets_status_idx ON support_tickets(status);
CREATE INDEX support_tickets_last_message_at_idx ON support_tickets(last_message_at);

-- Messages
CREATE TABLE support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_staff_reply BOOLEAN NOT NULL DEFAULT false,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX support_messages_ticket_id_created_at_idx ON support_messages(ticket_id, created_at);
CREATE INDEX support_messages_author_id_idx ON support_messages(author_id);
