-- C5: addresses we never mail again (hard bounces, spam complaints, admin adds).
CREATE TYPE "email_suppression_reason" AS ENUM ('BOUNCE', 'COMPLAINT', 'MANUAL');

CREATE TABLE "email_suppressions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "address" VARCHAR(320) NOT NULL,
    "reason" "email_suppression_reason" NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "details" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_suppressions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_suppressions_address_key" ON "email_suppressions"("address");
CREATE INDEX "email_suppressions_created_at_idx" ON "email_suppressions"("created_at");
