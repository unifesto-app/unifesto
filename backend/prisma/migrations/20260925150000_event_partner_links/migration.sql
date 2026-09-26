-- Partner tracking links: a named partner per event whose contact (a Unifesto
-- user) sees its registration counts in the app. Attribution itself uses
-- event_registrations.utm_*.
CREATE TABLE "event_partner_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "source" VARCHAR(60) NOT NULL,
    "partner_user_id" UUID NOT NULL,
    "created_by_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_partner_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_partner_links_event_id_source_key" ON "event_partner_links"("event_id", "source");
CREATE INDEX "event_partner_links_partner_user_id_idx" ON "event_partner_links"("partner_user_id");

ALTER TABLE "event_partner_links"
  ADD CONSTRAINT "event_partner_links_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_partner_links"
  ADD CONSTRAINT "event_partner_links_partner_user_id_fkey"
  FOREIGN KEY ("partner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
