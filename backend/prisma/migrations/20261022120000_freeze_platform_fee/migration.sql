-- A21: freeze the platform fee % on each sale when it is paid, so a plan or
-- default-rate change never rewrites past money (or unlocks withdrawable
-- balance). Payouts, financials and exports read this column.

ALTER TABLE "event_registrations" ADD COLUMN IF NOT EXISTS "platform_fee_percent" DECIMAL(5, 2);
ALTER TABLE "stay_bookings" ADD COLUMN IF NOT EXISTS "platform_fee_percent" DECIMAL(5, 2);
ALTER TABLE "group_seat_purchases" ADD COLUMN IF NOT EXISTS "platform_fee_percent" DECIMAL(5, 2);

-- The rate an event's space pays today. MIRRORS
-- PlanConfigService.resolvePlatformFeePercent (backend/src/subscription/
-- plan-config.service.ts): change both together (A9 will). Only REVENUE_SHARE
-- pays: the space's own rate, else the model default (config row; 8 when the
-- row doesn't exist, null in the row = 0). FREE, SUBSCRIPTION, none = 0.
CREATE OR REPLACE FUNCTION platform_fee_percent_for_event(p_event_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((
    SELECT CASE
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

-- Stamp the rate the moment a row first holds money. Never overwrites a rate
-- already frozen, so later refunds and status changes keep the original terms.
CREATE OR REPLACE FUNCTION stamp_platform_fee()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.platform_fee_percent IS NULL
     AND NEW.payment_status::text IN ('PAID', 'PARTIALLY_REFUNDED') THEN
    NEW.platform_fee_percent := platform_fee_percent_for_event(NEW.event_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER event_registrations_stamp_platform_fee
  BEFORE INSERT OR UPDATE ON "event_registrations"
  FOR EACH ROW EXECUTE FUNCTION stamp_platform_fee();
CREATE TRIGGER stay_bookings_stamp_platform_fee
  BEFORE INSERT OR UPDATE ON "stay_bookings"
  FOR EACH ROW EXECUTE FUNCTION stamp_platform_fee();
CREATE TRIGGER group_seat_purchases_stamp_platform_fee
  BEFORE INSERT OR UPDATE ON "group_seat_purchases"
  FOR EACH ROW EXECUTE FUNCTION stamp_platform_fee();

-- Backfill: every sale already paid keeps the rate it is charged today, so
-- nothing moves on deploy. Refunded rows too, in case a refund is reversed.
UPDATE "event_registrations"
   SET platform_fee_percent = platform_fee_percent_for_event(event_id)
 WHERE platform_fee_percent IS NULL
   AND payment_status::text IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED');
UPDATE "stay_bookings"
   SET platform_fee_percent = platform_fee_percent_for_event(event_id)
 WHERE platform_fee_percent IS NULL
   AND payment_status::text IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED');
UPDATE "group_seat_purchases"
   SET platform_fee_percent = platform_fee_percent_for_event(event_id)
 WHERE platform_fee_percent IS NULL
   AND payment_status::text IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED');
