-- Extra stay photos shown after the cover.
ALTER TABLE "stays" ADD COLUMN "gallery_urls" TEXT[] DEFAULT ARRAY[]::TEXT[];
