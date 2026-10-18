-- D17: help articles, the knowledge base for the Assist bot (D14).
CREATE TYPE "help_article_status" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "help_articles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(220) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "status" "help_article_status" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "help_articles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "help_articles_slug_key" ON "help_articles"("slug");

CREATE INDEX "help_articles_status_category_idx" ON "help_articles"("status", "category");
