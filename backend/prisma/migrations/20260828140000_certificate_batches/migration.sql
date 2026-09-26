-- Queued certificate issuance.
--
-- Issuance renders a PDF + PNG per recipient with @napi-rs/canvas (Skia), whose
-- buffers live in native memory outside the V8 heap. A large batch run inline in
-- the HTTP request pushed a replica's RSS past its memory cap and got it
-- OOM-killed (the "connection refused" gaps in the proxy logs). Issuance now
-- runs on a concurrency-bounded BullMQ worker; this table is each batch's
-- durable record so an organiser can poll progress and a restart can resume.

-- CreateEnum
CREATE TYPE "certificate_batch_status" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "certificate_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "audience" "certificate_audience" NOT NULL,
    "registration_ids" UUID[],
    "status" "certificate_batch_status" NOT NULL DEFAULT 'QUEUED',
    "total" INTEGER NOT NULL DEFAULT 0,
    "issued" INTEGER NOT NULL DEFAULT 0,
    "reactivated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "requested_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "certificate_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "certificate_batches_event_id_idx" ON "certificate_batches"("event_id");

-- CreateIndex
CREATE INDEX "certificate_batches_status_idx" ON "certificate_batches"("status");
