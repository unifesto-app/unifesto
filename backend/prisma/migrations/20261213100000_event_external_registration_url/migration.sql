-- Outside registration link: the event registers on another site.
ALTER TABLE "events" ADD COLUMN "external_registration_url" TEXT;
