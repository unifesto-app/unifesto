-- Billing model for organisers (free / revenue-share / subscription)

CREATE TYPE billing_model AS ENUM ('FREE', 'REVENUE_SHARE', 'SUBSCRIPTION');

ALTER TABLE org_subscriptions
  ADD COLUMN billing_model billing_model NOT NULL DEFAULT 'SUBSCRIPTION',
  ADD COLUMN revenue_share_percent DECIMAL(5, 2);
