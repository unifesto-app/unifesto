-- K6/Z7: website page views (any public page) land in page_views. Additive only.
ALTER TYPE "TrafficTarget" ADD VALUE IF NOT EXISTS 'PAGE';

ALTER TABLE "page_views" ALTER COLUMN "space_id" DROP NOT NULL;
ALTER TABLE "page_views" ADD COLUMN "path" VARCHAR(300);
ALTER TABLE "page_views" ADD COLUMN "referrer_domain" VARCHAR(255);

CREATE INDEX "page_views_target_created_at_idx" ON "page_views"("target", "created_at");
