-- A9 (D10): the organiser platform fee per plan lives in
-- plan_configs.platform_fee_percent (was the unused processing_fee_percent).
-- Ships at 0 so deploying charges nobody; an admin sets Starter 2.5, Pro 1.5,
-- Enterprise 1 in Apex Plans once the A10 notice is out. Sales already paid
-- keep the rate frozen on them (A21).
ALTER TABLE "plan_configs" RENAME COLUMN "processing_fee_percent" TO "platform_fee_percent";
UPDATE "plan_configs" SET "platform_fee_percent" = 0;

-- Same rule as PlanConfigService.resolvePlatformFeePercent; both read the plan
-- rates from plan_configs, so only the rule is mirrored here, never the numbers.
--   SUBSCRIPTION: its plan's rate (GROWTH is retired: Starter's rate; no row = 0)
--   REVENUE_SHARE: the space's own rate, else the model default
--   FREE, none: 0
CREATE OR REPLACE FUNCTION platform_fee_percent_for_event(p_event_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN s.billing_model::text = 'SUBSCRIPTION' THEN COALESCE(
        (SELECT p.platform_fee_percent
           FROM plan_configs p
          WHERE p.plan::text = CASE WHEN s.plan::text = 'GROWTH' THEN 'STARTER' ELSE s.plan::text END),
        0
      )
      WHEN s.billing_model::text = 'REVENUE_SHARE' THEN COALESCE(
        s.revenue_share_percent,
        (SELECT COALESCE(c.default_revenue_share_percent, 0)
           FROM billing_model_configs c
          WHERE c.billing_model::text = 'REVENUE_SHARE'),
        8
      )
      ELSE 0
    END
    FROM events e
    JOIN org_subscriptions s ON s.space_id = e.space_id
    WHERE e.id = p_event_id
  ), 0);
$$;
