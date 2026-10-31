-- Z2: the organiser platform fee goes live on 31 Oct 2026. No subscriptions:
-- the five plans are priced by their fee per paid ticket. General 3%, Club
-- 3.5%, Growth 4% (at least ₹999 an event), Pro 4.5% (at least ₹2,999 an
-- event), Enterprise by contract (0 here until a space has a deal). The A21
-- trigger stamps these rates on each sale as it is paid, so tickets sold
-- before this migration keep the 0 they carry.

-- 1. Every space starts on General, with a history row.
INSERT INTO "subscription_history" ("subscription_id", "from_plan", "to_plan", "reason")
SELECT "id", "plan", 'STARTER', 'Plans priced by platform fee: every space starts on General'
  FROM "org_subscriptions"
 WHERE "plan" <> 'STARTER';

UPDATE "org_subscriptions"
   SET "plan" = 'STARTER',
       "billing_cycle" = 'MONTHLY',
       "amount" = 0,
       "expires_at" = NULL,
       "cancelled_at" = NULL,
       "next_payment_at" = NULL,
       "pending_plan" = NULL,
       "pending_billing_cycle" = NULL,
       "updated_at" = now()
 WHERE "plan" <> 'STARTER' OR "pending_plan" IS NOT NULL;

-- 2. Limits, features and fees. Prices go to 0: self-serve checkout refuses
-- a ₹0 plan, so only an admin moves a space up (Apex › Spaces).
INSERT INTO "plan_configs" (
  "plan", "spaces", "events_per_month", "attendees_per_event", "ticket_types", "co_organisers",
  "has_waitlist", "has_bulk_export", "has_analytics", "has_whatsapp_blast",
  "has_recurring_events", "has_remove_branding", "has_priority_support",
  "has_sessions", "has_leaderboard", "has_certificates", "has_sponsors",
  "monthly_price", "annual_price", "platform_fee_percent", "updated_at"
) VALUES
  ('STARTER',    1,    NULL, 300,  3,    2,    true, false, false, false, false, false, false, false, false, false, false, 0,    0,    3,   now()),
  ('CLUB',       1,    NULL, 1000, NULL, 5,    true, true,  true,  false, true,  false, false, false, false, true,  false, 0,    0,    3.5, now()),
  ('GROWTH',     5,    NULL, 5000, NULL, 10,   true, true,  true,  true,  true,  false, true,  true,  true,  true,  true,  0,    0,    4,   now()),
  ('PRO',        10,   NULL, NULL, NULL, NULL, true, true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  0,    0,    4.5, now()),
  ('ENTERPRISE', NULL, NULL, NULL, NULL, NULL, true, true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  NULL, NULL, 0,   now())
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
  "platform_fee_percent" = EXCLUDED."platform_fee_percent",
  "updated_at" = now();
