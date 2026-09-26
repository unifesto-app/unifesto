-- Careers: public job postings for the marketing site. Applications are
-- handled off-platform via email, so no applicant table is needed.

-- CreateEnum
CREATE TYPE "career_status" AS ENUM ('OPEN', 'CLOSED', 'DRAFT');

-- CreateTable
CREATE TABLE "careers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255) NOT NULL,
    "department" VARCHAR(120) NOT NULL,
    "location" VARCHAR(160) NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "experience_level" VARCHAR(80) NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT[],
    "responsibilities" TEXT[],
    "benefits" TEXT[],
    "salary_range" VARCHAR(120),
    "status" "career_status" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "careers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "careers_status_idx" ON "careers"("status");
