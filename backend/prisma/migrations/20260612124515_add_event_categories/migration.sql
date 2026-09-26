CREATE TABLE "event_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "icon_url" TEXT,
    "color" VARCHAR(7),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "event_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_categories_name_key" ON "event_categories"("name");
CREATE UNIQUE INDEX "event_categories_slug_key" ON "event_categories"("slug");

-- Seed default categories
INSERT INTO "event_categories" ("name", "slug", "color", "order", "updated_at") VALUES
('Technology', 'technology', '#3B82F6', 1, NOW()),
('Music', 'music', '#8B5CF6', 2, NOW()),
('Sports', 'sports', '#10B981', 3, NOW()),
('Arts', 'arts', '#F59E0B', 4, NOW()),
('Business', 'business', '#6366F1', 5, NOW()),
('Food', 'food', '#EF4444', 6, NOW()),
('Health & Wellness', 'health-wellness', '#14B8A6', 7, NOW()),
('Education', 'education', '#F97316', 8, NOW()),
('Entertainment', 'entertainment', '#EC4899', 9, NOW()),
('Networking', 'networking', '#06B6D4', 10, NOW()),
('Gaming', 'gaming', '#84CC16', 11, NOW()),
('Community', 'community', '#A855F7', 12, NOW());
