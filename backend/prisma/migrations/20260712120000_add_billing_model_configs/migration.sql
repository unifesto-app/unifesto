-- Admin-editable definitions for the non-subscription billing models
-- (Free and Revenue-share): what limits/features they include + default %.

CREATE TABLE billing_model_configs (
  billing_model billing_model PRIMARY KEY,
  default_revenue_share_percent DECIMAL(5, 2),
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with sensible defaults (admins can adjust). Free & revenue-share
-- organisers are usually partners, so they get a Growth-like allowance.
INSERT INTO billing_model_configs (
  billing_model, default_revenue_share_percent,
  spaces, events_per_month, attendees_per_event, ticket_types, co_organisers,
  has_waitlist, has_bulk_export, has_analytics, has_whatsapp_blast,
  has_recurring_events, has_remove_branding, has_priority_support
) VALUES
  ('FREE',          NULL, 2, 10, 200, 3, 1, true, true, false, false, false, false, false),
  ('REVENUE_SHARE', 8,    5, NULL, 1000, NULL, 3, true, true, true, true, false, true, false);
