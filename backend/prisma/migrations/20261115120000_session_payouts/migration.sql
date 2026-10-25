-- T6 / A17: Huddle session revenue can be paid out. A payout draws from
-- exactly one of an event or a session, and a session sale freezes the
-- organiser fee when it is paid, like a ticket (A21).

ALTER TABLE "payouts" ALTER COLUMN "event_id" DROP NOT NULL;
ALTER TABLE "payouts" ADD COLUMN "session_id" UUID;
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "payouts_session_id_idx" ON "payouts"("session_id");
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_one_source"
  CHECK (("event_id" IS NULL) <> ("session_id" IS NULL));

ALTER TABLE "session_registrations" ADD COLUMN "platform_fee_percent" DECIMAL(5, 2);

-- The rate a space pays today, now keyed by space so sessions share it.
-- MIRRORS PlanConfigService.resolvePlatformFeePercent; same rule as
-- 20261023100000_organiser_platform_fee, only the lookup key changed.
CREATE OR REPLACE FUNCTION platform_fee_percent_for_space(p_space_id uuid)
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
    FROM org_subscriptions s
    WHERE s.space_id = p_space_id
  ), 0);
$$;

CREATE OR REPLACE FUNCTION platform_fee_percent_for_event(p_event_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT platform_fee_percent_for_space((SELECT e.space_id FROM events e WHERE e.id = p_event_id));
$$;

-- Stamp a session sale the moment it first holds money; never overwrite a
-- rate already frozen (a deal's own fee is written by the app).
CREATE OR REPLACE FUNCTION stamp_session_platform_fee()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.platform_fee_percent IS NULL
     AND NEW.payment_status::text IN ('PAID', 'PARTIALLY_REFUNDED') THEN
    NEW.platform_fee_percent := platform_fee_percent_for_space(
      (SELECT s.space_id FROM sessions s WHERE s.id = NEW.session_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER session_registrations_stamp_platform_fee
  BEFORE INSERT OR UPDATE ON "session_registrations"
  FOR EACH ROW EXECUTE FUNCTION stamp_session_platform_fee();

-- Backfill: session sales already paid keep today's rate, so nothing moves
-- on deploy and a later plan-fee change never reaches them.
UPDATE "session_registrations" r
   SET platform_fee_percent = platform_fee_percent_for_space(s.space_id)
  FROM "sessions" s
 WHERE s.id = r.session_id
   AND r.platform_fee_percent IS NULL
   AND r.payment_status::text IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED');
