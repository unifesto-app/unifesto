-- White-label, the big version (P1): full theme + self-serve + admin suspend.
-- Additive only. Existing white-labelled spaces keep rendering unchanged.
ALTER TABLE "spaces"
  ADD COLUMN "branding_suspended_at" TIMESTAMPTZ(6),
  ADD COLUMN "brand_font" VARCHAR(40),
  ADD COLUMN "brand_mode" VARCHAR(10),
  ADD COLUMN "hide_powered_by" BOOLEAN NOT NULL DEFAULT false;
