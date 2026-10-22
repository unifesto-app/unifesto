-- T8 hotfix: paid plans used to end on the next 1st of the month (monthly) or
-- 1 Jan (annual). Re-derive the period end from the payment that bought the
-- current plan: paid-at + one cycle, on the same IST calendar day (Postgres
-- clamps 31 Jan + 1 month to 28/29 Feb). Data only; never shortens a period.
WITH last_paid AS (
  SELECT DISTINCT ON (h.subscription_id) h.subscription_id, h.changed_at
  FROM subscription_history h
  JOIN org_subscriptions s ON s.id = h.subscription_id
  WHERE h.payment_id IS NOT NULL
    AND h.to_plan = s.plan
  ORDER BY h.subscription_id, h.changed_at DESC
),
fixed AS (
  SELECT s.id,
         ((lp.changed_at AT TIME ZONE 'Asia/Kolkata')
           + CASE WHEN s.billing_cycle = 'ANNUAL' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END
         ) AT TIME ZONE 'Asia/Kolkata' AS period_end
  FROM org_subscriptions s
  JOIN last_paid lp ON lp.subscription_id = s.id
  WHERE s.billing_model = 'SUBSCRIPTION'
    AND s.plan <> 'STARTER'
)
UPDATE org_subscriptions s
SET expires_at      = GREATEST(COALESCE(s.expires_at, f.period_end), f.period_end),
    next_payment_at = CASE WHEN s.cancelled_at IS NULL
                           THEN GREATEST(COALESCE(s.expires_at, f.period_end), f.period_end)
                           ELSE s.next_payment_at END,
    updated_at      = NOW()
FROM fixed f
WHERE f.id = s.id;
