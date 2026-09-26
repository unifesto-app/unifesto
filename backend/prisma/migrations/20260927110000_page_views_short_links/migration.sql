-- 4.0.5 (5.3g/h/i): page views for event + space pages, and short tracking links.
-- Additive only: new enum + 2 new tables.
-- CreateEnum
CREATE TYPE "page_target" AS ENUM ('EVENT', 'SPACE');

-- CreateTable
CREATE TABLE "page_views" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "target" "page_target" NOT NULL,
    "event_id" UUID,
    "space_id" UUID,
    "target_id" UUID NOT NULL,
    "visitor_id" VARCHAR(64) NOT NULL,
    "user_id" UUID,
    "platform" VARCHAR(10) NOT NULL,
    "utm_source" VARCHAR(100),
    "utm_medium" VARCHAR(100),
    "utm_campaign" VARCHAR(100),
    "referrer" VARCHAR(120),
    "day" DATE NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "page_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "short_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(16) NOT NULL,
    "target" "page_target" NOT NULL,
    "event_id" UUID,
    "space_id" UUID NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "utm_source" VARCHAR(100) NOT NULL,
    "utm_medium" VARCHAR(100),
    "utm_campaign" VARCHAR(100),
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "last_clicked_at" TIMESTAMPTZ(6),
    "created_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "short_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_views_event_id_day_idx" ON "page_views"("event_id", "day");

-- CreateIndex
CREATE INDEX "page_views_space_id_day_idx" ON "page_views"("space_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "page_views_target_target_id_visitor_id_day_key" ON "page_views"("target", "target_id", "visitor_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "short_links_code_key" ON "short_links"("code");

-- CreateIndex
CREATE INDEX "short_links_event_id_idx" ON "short_links"("event_id");

-- CreateIndex
CREATE INDEX "short_links_space_id_idx" ON "short_links"("space_id");

-- AddForeignKey
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "short_links" ADD CONSTRAINT "short_links_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "short_links" ADD CONSTRAINT "short_links_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

