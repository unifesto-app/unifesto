-- T11: tax and gateway fees on each sale, so the take rate is true.
--   gst_paise, place_of_supply: stamped by stamp_sale_tax() below the moment a
--     sale is paid, like the frozen platform_fee_percent (A21). GST stays 0
--     until the CA rules in A6 (platform_gst_percent() is the gate).
--   gateway_fee_paise, gateway_tax_paise: Razorpay's fee before GST and the GST
--     on it (their sum is Razorpay's `fee`), written by the app from the
--     payment.captured webhook and reconcile (scripts/backfill-gateway-fees.ts
--     for older sales). Razorpay keeps its fee on a refund, so these never
--     change once set.
-- Null = not stamped: unpaid, or (gateway pair) an older sale not backfilled.

ALTER TABLE "event_registrations"
  ADD COLUMN "gst_paise" INTEGER,
  ADD COLUMN "place_of_supply" VARCHAR(2),
  ADD COLUMN "gateway_fee_paise" INTEGER,
  ADD COLUMN "gateway_tax_paise" INTEGER;
ALTER TABLE "group_seat_purchases"
  ADD COLUMN "gst_paise" INTEGER,
  ADD COLUMN "place_of_supply" VARCHAR(2),
  ADD COLUMN "gateway_fee_paise" INTEGER,
  ADD COLUMN "gateway_tax_paise" INTEGER;

-- The space's GSTIN, for A6 invoices. Nothing reads it yet.
ALTER TABLE "spaces" ADD COLUMN "gstin" VARCHAR(15);

-- GST % charged on Unifesto's fee. The A6 gate: 0 until the CA confirms the
-- rate and whether the fee is GST-inclusive. Changing it only affects sales
-- paid afterwards (the snapshot is frozen like the platform fee).
CREATE OR REPLACE FUNCTION platform_gst_percent()
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 0::numeric $$;

-- GST state code ('36' = Telangana) for a free-text state name, null when it
-- isn't one of the 36 states and union territories (or the event is online).
CREATE OR REPLACE FUNCTION gst_state_code(p_state text)
RETURNS varchar(2)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(btrim(p_state))
    WHEN 'jammu and kashmir' THEN '01'
    WHEN 'himachal pradesh' THEN '02'
    WHEN 'punjab' THEN '03'
    WHEN 'chandigarh' THEN '04'
    WHEN 'uttarakhand' THEN '05'
    WHEN 'haryana' THEN '06'
    WHEN 'delhi' THEN '07'
    WHEN 'new delhi' THEN '07'
    WHEN 'rajasthan' THEN '08'
    WHEN 'uttar pradesh' THEN '09'
    WHEN 'bihar' THEN '10'
    WHEN 'sikkim' THEN '11'
    WHEN 'arunachal pradesh' THEN '12'
    WHEN 'nagaland' THEN '13'
    WHEN 'manipur' THEN '14'
    WHEN 'mizoram' THEN '15'
    WHEN 'tripura' THEN '16'
    WHEN 'meghalaya' THEN '17'
    WHEN 'assam' THEN '18'
    WHEN 'west bengal' THEN '19'
    WHEN 'jharkhand' THEN '20'
    WHEN 'odisha' THEN '21'
    WHEN 'orissa' THEN '21'
    WHEN 'chhattisgarh' THEN '22'
    WHEN 'madhya pradesh' THEN '23'
    WHEN 'gujarat' THEN '24'
    WHEN 'dadra and nagar haveli and daman and diu' THEN '26'
    WHEN 'maharashtra' THEN '27'
    WHEN 'karnataka' THEN '29'
    WHEN 'goa' THEN '30'
    WHEN 'lakshadweep' THEN '31'
    WHEN 'kerala' THEN '32'
    WHEN 'tamil nadu' THEN '33'
    WHEN 'puducherry' THEN '34'
    WHEN 'pondicherry' THEN '34'
    WHEN 'andaman and nicobar islands' THEN '35'
    WHEN 'telangana' THEN '36'
    WHEN 'andhra pradesh' THEN '37'
    WHEN 'ladakh' THEN '38'
  END
$$;

-- Unifesto's fee on a sale is the buyer fee plus the organiser's platform fee
-- on the base (total - buyer fee). Rupees x percent = paise. Runs after
-- stamp_platform_fee (triggers fire in name order), so the rate is frozen.
-- REFUNDED counts too: a capture refunded before reconcile still kept its fee.
CREATE OR REPLACE FUNCTION stamp_sale_tax()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.gst_paise IS NULL
     AND NEW.payment_status::text IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') THEN
    NEW.gst_paise := ROUND(
      (NEW.processing_fee
        + (NEW.total_amount - NEW.processing_fee) * COALESCE(NEW.platform_fee_percent, 0) / 100)
      * platform_gst_percent()
    );
    NEW.place_of_supply := (SELECT gst_state_code(e.state) FROM events e WHERE e.id = NEW.event_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER event_registrations_stamp_sale_tax
  BEFORE INSERT OR UPDATE ON "event_registrations"
  FOR EACH ROW EXECUTE FUNCTION stamp_sale_tax();
CREATE TRIGGER group_seat_purchases_stamp_sale_tax
  BEFORE INSERT OR UPDATE ON "group_seat_purchases"
  FOR EACH ROW EXECUTE FUNCTION stamp_sale_tax();

-- Backfill: sales already paid get their snapshot now (no GST was charged on
-- them). Setting the null column to null is enough: the trigger fills it.
-- Raw SQL leaves updated_at alone, so offline scanners don't re-pull them.
UPDATE "event_registrations" SET gst_paise = NULL
 WHERE gst_paise IS NULL AND payment_status::text IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED');
UPDATE "group_seat_purchases" SET gst_paise = NULL
 WHERE gst_paise IS NULL AND payment_status::text IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED');
