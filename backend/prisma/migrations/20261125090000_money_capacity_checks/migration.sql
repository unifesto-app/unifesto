-- J18: the database itself refuses impossible money and capacity values, so a
-- bug or a hand-written UPDATE can't store a negative price, amount, refund,
-- count or capacity, or a fee percent outside 0-100. Prisma has no CHECK
-- support, so these live only here (migrate diff ignores them).
--
-- Each check is added NOT VALID (new and updated rows are checked at once,
-- no full-table lock), then validated against the existing rows. If old rows
-- break one, it stays NOT VALID with a WARNING instead of failing the deploy:
-- find them with the expression in the warning, fix them, then run
-- ALTER TABLE <table> VALIDATE CONSTRAINT <name>.
--
-- Deliberately not here: "refunded <= paid" and "sold <= ticket quantity".
-- Some flows record the charge or the seats elsewhere (group seats, manual
-- adds, imports), so those would need a full audit first, and a wrong check
-- on a money path fails refunds at runtime.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('event_ticket_types',    'event_ticket_types_price_check',         'price >= 0'),
      ('event_ticket_types',    'event_ticket_types_sold_count_check',    'sold_count >= 0'),
      ('event_registrations',   'event_registrations_amounts_check',      'total_amount >= 0 AND razorpay_amount >= 0 AND processing_fee >= 0 AND refunded_amount >= 0'),
      ('event_registrations',   'event_registrations_fee_percent_check',  'platform_fee_percent BETWEEN 0 AND 100'),
      ('group_seat_purchases',  'group_seat_purchases_amounts_check',     'base_amount >= 0 AND processing_fee >= 0 AND total_amount >= 0 AND refunded_amount >= 0'),
      ('group_seat_purchases',  'group_seat_purchases_fee_percent_check', 'platform_fee_percent BETWEEN 0 AND 100'),
      ('session_registrations', 'session_registrations_amounts_check',    'total_amount >= 0 AND razorpay_amount >= 0 AND processing_fee >= 0 AND refunded_amount >= 0'),
      ('session_registrations', 'session_registrations_fee_percent_check','platform_fee_percent BETWEEN 0 AND 100'),
      ('stay_bookings',         'stay_bookings_amounts_check',            'base_amount >= 0 AND processing_fee >= 0 AND total_amount >= 0 AND refunded_amount >= 0'),
      ('stay_bookings',         'stay_bookings_fee_percent_check',        'platform_fee_percent BETWEEN 0 AND 100'),
      ('coupon_redemptions',    'coupon_redemptions_discount_check',      'discount_amount >= 0'),
      ('refund_requests',       'refund_requests_amounts_check',          'requested_amount >= 0 AND approved_amount >= 0'),
      ('payouts',               'payouts_fee_check',                      'platform_fee >= 0 AND platform_fee_percent BETWEEN 0 AND 100'),
      ('sessions',              'sessions_price_capacity_check',          'price >= 0 AND capacity >= 0'),
      ('events',                'events_capacity_check',                  'capacity >= 0'),
      ('hackathon_rooms',       'hackathon_rooms_capacity_check',         'capacity >= 0'),
      ('plan_configs',          'plan_configs_fee_percent_check',         'platform_fee_percent BETWEEN 0 AND 100'),
      ('platform_config',       'platform_config_fee_percent_check',      'processing_fee_percent BETWEEN 0 AND 100')
    ) AS t(tbl, name, expr)
  LOOP
    -- A NULL column passes a CHECK, so the optional columns need no IS NULL.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.name) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%s) NOT VALID', c.tbl, c.name, c.expr);
    END IF;
    BEGIN
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', c.tbl, c.name);
    EXCEPTION WHEN check_violation THEN
      RAISE WARNING 'J18: rows in % break % (%); left NOT VALID, new writes are still checked', c.tbl, c.name, c.expr;
    END;
  END LOOP;
END $$;
