-- Plan lineup: General (STARTER) · Club · Growth · Pro · Enterprise. The Free
-- and Revenue-share billing models are retired; every space is on a plan and
-- custom terms live in deals (D8). Expand step only: billing_model,
-- revenue_share_percent, billing_model_configs and the billing_model enum stay
-- (unused) until a contract-step migration drops them in a later deploy.

-- 1. Spaces on Free or Revenue share move to General, with a history row.
INSERT INTO "subscription_history" ("subscription_id", "from_plan", "to_plan", "reason")
SELECT "id", "plan", 'STARTER', 'Billing model ' || "billing_model"::text || ' removed: moved to General'
  FROM "org_subscriptions"
 WHERE "billing_model"::text <> 'SUBSCRIPTION';

UPDATE "org_subscriptions"
   SET "plan" = 'STARTER',
       "billing_model" = 'SUBSCRIPTION',
       "revenue_share_percent" = NULL,
       "billing_cycle" = 'MONTHLY',
       "amount" = 0,
       "expires_at" = NULL,
       "pending_plan" = NULL,
       "pending_billing_cycle" = NULL,
       "updated_at" = now()
 WHERE "billing_model"::text <> 'SUBSCRIPTION';

-- 2. The lineup's prices, limits and features. platform_fee_percent is left
-- alone: an admin sets the rates in Apex › Plans when the fee starts (D10).
INSERT INTO "plan_configs" (
  "plan", "spaces", "events_per_month", "attendees_per_event", "ticket_types", "co_organisers",
  "has_waitlist", "has_bulk_export", "has_analytics", "has_whatsapp_blast",
  "has_recurring_events", "has_remove_branding", "has_priority_support",
  "has_sessions", "has_leaderboard", "has_certificates", "has_sponsors",
  "monthly_price", "annual_price", "updated_at"
) VALUES
  ('STARTER',    1,    1,    100,  1,    0,    false, false, false, false, false, false, false, false, false, false, false, 0,    0,     now()),
  ('CLUB',       1,    4,    300,  3,    1,    true,  true,  true,  false, false, false, false, false, false, true,  false, 499,  4990,  now()),
  ('GROWTH',     5,    NULL, 1000, NULL, 3,    true,  true,  true,  true,  true,  false, true,  true,  true,  true,  true,  1999, 19990, now()),
  ('PRO',        10,   NULL, 5000, NULL, 10,   true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  2999, 29990, now()),
  ('ENTERPRISE', NULL, NULL, NULL, NULL, NULL, true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  NULL, NULL,  now())
ON CONFLICT ("plan") DO UPDATE SET
  "spaces" = EXCLUDED."spaces",
  "events_per_month" = EXCLUDED."events_per_month",
  "attendees_per_event" = EXCLUDED."attendees_per_event",
  "ticket_types" = EXCLUDED."ticket_types",
  "co_organisers" = EXCLUDED."co_organisers",
  "has_waitlist" = EXCLUDED."has_waitlist",
  "has_bulk_export" = EXCLUDED."has_bulk_export",
  "has_analytics" = EXCLUDED."has_analytics",
  "has_whatsapp_blast" = EXCLUDED."has_whatsapp_blast",
  "has_recurring_events" = EXCLUDED."has_recurring_events",
  "has_remove_branding" = EXCLUDED."has_remove_branding",
  "has_priority_support" = EXCLUDED."has_priority_support",
  "has_sessions" = EXCLUDED."has_sessions",
  "has_leaderboard" = EXCLUDED."has_leaderboard",
  "has_certificates" = EXCLUDED."has_certificates",
  "has_sponsors" = EXCLUDED."has_sponsors",
  "monthly_price" = EXCLUDED."monthly_price",
  "annual_price" = EXCLUDED."annual_price",
  "updated_at" = now();

-- 3. The fee rule without billing models: the plan's rate, 0 with no
-- subscription. MIRRORS PlanConfigService.resolvePlatformFeePercent. Growth
-- is a real plan again, so it no longer maps to Starter's rate.
CREATE OR REPLACE FUNCTION platform_fee_percent_for_space(p_space_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((
    SELECT COALESCE(
      (SELECT p.platform_fee_percent FROM plan_configs p WHERE p.plan = s.plan),
      0
    )
    FROM org_subscriptions s
    WHERE s.space_id = p_space_id
  ), 0);
$$;
