-- U4: company obligations (Apex Company section) + their activity log.
-- CreateEnum
CREATE TYPE "CompanyItemCategory" AS ENUM ('ROC', 'TAX', 'GST', 'IP', 'GOVERNANCE', 'PEOPLE', 'FINANCE', 'FUNDING');

-- CreateEnum
CREATE TYPE "CompanyItemStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'WAITING', 'FILED', 'DONE', 'NA');

-- CreateEnum
CREATE TYPE "CompanyRecurrence" AS ENUM ('NONE', 'MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateTable
CREATE TABLE "company_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "number" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "category" "CompanyItemCategory" NOT NULL,
    "status" "CompanyItemStatus" NOT NULL DEFAULT 'TODO',
    "due_date" DATE,
    "owner_id" UUID,
    "restricted" BOOLEAN NOT NULL DEFAULT false,
    "filed_on" DATE,
    "reference" VARCHAR(120),
    "notes" TEXT,
    "recurrence" "CompanyRecurrence" NOT NULL DEFAULT 'NONE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "company_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_activity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" UUID NOT NULL,
    "actor" VARCHAR(160) NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_items_number_key" ON "company_items"("number");

-- CreateIndex
CREATE INDEX "company_items_due_date_idx" ON "company_items"("due_date");

-- CreateIndex
CREATE INDEX "company_items_owner_id_idx" ON "company_items"("owner_id");

-- CreateIndex
CREATE INDEX "company_activity_item_id_created_at_idx" ON "company_activity"("item_id", "created_at");

-- AddForeignKey
ALTER TABLE "company_items" ADD CONSTRAINT "company_items_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_activity" ADD CONSTRAINT "company_activity_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "company_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

