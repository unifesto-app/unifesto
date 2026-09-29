-- 4.0.5: stand-in banners (4:3) and logos (1:1) managed in Apex, shown for
-- events without a cover and spaces without a logo. Additive.
-- CreateEnum
CREATE TYPE "DefaultImageKind" AS ENUM ('BANNER', 'LOGO');

-- CreateTable
CREATE TABLE "default_images" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "DefaultImageKind" NOT NULL,
    "url" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "default_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "default_images_kind_created_at_idx" ON "default_images"("kind", "created_at");

