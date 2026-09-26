-- In-platform job applications with uploaded resumes.

-- CreateEnum
CREATE TYPE "application_status" AS ENUM ('NEW', 'REVIEWING', 'SHORTLISTED', 'REJECTED', 'HIRED');

-- CreateTable
CREATE TABLE "career_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "career_id" UUID NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(40),
    "resume_url" TEXT NOT NULL,
    "cover_letter" TEXT,
    "linkedin_url" TEXT,
    "portfolio_url" TEXT,
    "status" "application_status" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "career_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "career_applications_career_id_idx" ON "career_applications"("career_id");

-- CreateIndex
CREATE INDEX "career_applications_status_idx" ON "career_applications"("status");

-- AddForeignKey
ALTER TABLE "career_applications" ADD CONSTRAINT "career_applications_career_id_fkey" FOREIGN KEY ("career_id") REFERENCES "careers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
