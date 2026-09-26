-- Categories: add a 4:3 banner image, drop the unused color field.

-- AlterTable
ALTER TABLE "event_categories" ADD COLUMN "banner_url" TEXT;

-- AlterTable
ALTER TABLE "event_categories" DROP COLUMN "color";
