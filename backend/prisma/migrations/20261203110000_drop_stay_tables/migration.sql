-- contract-step: S59. Unifesto Stay was removed in #576. Prod had 0 rows in all
-- five tables on 3 Nov 2026. Refuse to run if any row appeared since.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "stays") OR EXISTS (SELECT 1 FROM "stay_options")
     OR EXISTS (SELECT 1 FROM "stay_questions") OR EXISTS (SELECT 1 FROM "stay_bookings")
     OR EXISTS (SELECT 1 FROM "stay_guests") THEN
    RAISE EXCEPTION 'stay tables are not empty; not dropping them';
  END IF;
END $$;

-- No CASCADE: nothing outside these tables should depend on them.
DROP TABLE "stay_guests";
DROP TABLE "stay_bookings";
DROP TABLE "stay_questions";
DROP TABLE "stay_options";
DROP TABLE "stays";

DROP TYPE "stay_booking_status";
DROP TYPE "stay_pricing";
DROP TYPE "stay_payment_mode";
DROP TYPE "stay_gender";
DROP TYPE "stay_property_type";
