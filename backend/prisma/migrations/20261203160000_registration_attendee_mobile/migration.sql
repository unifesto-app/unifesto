-- A35: keep the mobile a curator types on import / manual add. Accounts made
-- for those attendees carry a `+0…` placeholder, so the typed number lives on
-- the registration and readers prefer it over the placeholder. Additive.
ALTER TABLE "event_registrations" ADD COLUMN "attendee_mobile" VARCHAR(20);
