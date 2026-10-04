-- Events can sit in several categories; `category` stays as the primary (first).
ALTER TABLE "events" ADD COLUMN "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "events" SET "categories" = ARRAY["category"]::TEXT[] WHERE "category" IS NOT NULL AND "category" <> '';

CREATE INDEX "events_categories_idx" ON "events" USING GIN ("categories");
