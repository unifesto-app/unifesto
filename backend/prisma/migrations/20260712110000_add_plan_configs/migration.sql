-- Admin-editable plan definitions (limits / features / pricing / fees)

CREATE TABLE plan_configs (
  plan org_plan PRIMARY KEY,
  spaces INTEGER,
  events_per_month INTEGER,
  attendees_per_event INTEGER,
  ticket_types INTEGER,
  co_organisers INTEGER,
  has_waitlist BOOLEAN NOT NULL DEFAULT false,
  has_bulk_export BOOLEAN NOT NULL DEFAULT false,
  has_analytics BOOLEAN NOT NULL DEFAULT false,
  has_whatsapp_blast BOOLEAN NOT NULL DEFAULT false,
  has_recurring_events BOOLEAN NOT NULL DEFAULT false,
  has_remove_branding BOOLEAN NOT NULL DEFAULT false,
  has_priority_support BOOLEAN NOT NULL DEFAULT false,
  processing_fee_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  monthly_price INTEGER,
  annual_price INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with the values previously hardcoded in plan-limits.config.ts
INSERT INTO plan_configs (
  plan, spaces, events_per_month, attendees_per_event, ticket_types, co_organisers,
  has_waitlist, has_bulk_export, has_analytics, has_whatsapp_blast,
  has_recurring_events, has_remove_branding, has_priority_support,
  processing_fee_percent, monthly_price, annual_price
) VALUES
  ('STARTER',    1,  2,   50,  1, 0, false, false, false, false, false, false, false, 5, 0,    0),
  ('GROWTH',     2,  10,  200, 3, 1, true,  true,  false, false, false, false, false, 5, 499,  4499),
  ('PRO',        5,  NULL,1000,NULL,3,true, true,  true,  true,  true,  true,  true,  4, 1499, 13999),
  ('ENTERPRISE', NULL,NULL,NULL,NULL,NULL,true,true,true,true,   true,  true,  true,  3, NULL, NULL);
