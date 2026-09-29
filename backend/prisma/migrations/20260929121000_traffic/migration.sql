-- Traffic (4.0.5): page views of event/space pages, tracked short links served
-- at /l/<code>, and their clicks. Additive only: new enum, tables and indexes.
-- CreateEnum
CREATE TYPE "TrafficTarget" AS ENUM ('EVENT', 'SPACE', 'URL');

-- CreateTable
CREATE TABLE "page_views" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "target" "TrafficTarget" NOT NULL,
    "event_id" UUID,
    "space_id" UUID NOT NULL,
    "visitor_id" VARCHAR(64) NOT NULL,
    "platform" VARCHAR(16) NOT NULL,
    "source" VARCHAR(100),
    "medium" VARCHAR(100),
    "campaign" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "short_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(16) NOT NULL,
    "target" "TrafficTarget" NOT NULL,
    "event_id" UUID,
    "space_id" UUID,
    "url" TEXT NOT NULL,
    "title" VARCHAR(120),
    "source" VARCHAR(60) NOT NULL DEFAULT 'link',
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "short_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "short_link_clicks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "short_link_id" UUID NOT NULL,
    "visitor_hash" VARCHAR(64) NOT NULL,
    "referrer_domain" VARCHAR(255),
    "device" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "short_link_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_views_event_id_created_at_idx" ON "page_views"("event_id", "created_at");

-- CreateIndex
CREATE INDEX "page_views_space_id_created_at_idx" ON "page_views"("space_id", "created_at");

-- CreateIndex
CREATE INDEX "page_views_created_at_idx" ON "page_views"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "short_links_code_key" ON "short_links"("code");

-- CreateIndex
CREATE INDEX "short_links_space_id_idx" ON "short_links"("space_id");

-- CreateIndex
CREATE INDEX "short_links_event_id_idx" ON "short_links"("event_id");

-- CreateIndex
CREATE INDEX "short_link_clicks_short_link_id_created_at_idx" ON "short_link_clicks"("short_link_id", "created_at");

-- AddForeignKey
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "short_links" ADD CONSTRAINT "short_links_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "short_links" ADD CONSTRAINT "short_links_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "short_link_clicks" ADD CONSTRAINT "short_link_clicks_short_link_id_fkey" FOREIGN KEY ("short_link_id") REFERENCES "short_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
