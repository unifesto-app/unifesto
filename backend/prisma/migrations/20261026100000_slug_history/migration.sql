-- B16: old event / space slugs keep resolving after a rename.
CREATE TYPE "slug_kind" AS ENUM ('EVENT', 'SPACE');

CREATE TABLE "slug_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "slug_kind" NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "target_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slug_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "slug_history_kind_slug_key" ON "slug_history"("kind", "slug");
