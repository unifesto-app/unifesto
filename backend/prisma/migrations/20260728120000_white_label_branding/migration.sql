-- White-label (organiser branding) for spaces & events
--
-- Adds attendee-facing branding fields (accent colour + logo) plus an
-- admin-approved gate flag on both spaces and events, and the
-- white_label_requests table that drives the organiser→admin approval flow
-- (mirrors space_ownership_requests / space_status_requests).

-- AlterTable
ALTER TABLE "spaces" ADD COLUMN "white_label_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "spaces" ADD COLUMN "brand_color" VARCHAR(9);
ALTER TABLE "spaces" ADD COLUMN "brand_logo_url" TEXT;

-- AlterTable
ALTER TABLE "events" ADD COLUMN "white_label_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "events" ADD COLUMN "brand_color" VARCHAR(9);
ALTER TABLE "events" ADD COLUMN "brand_logo_url" TEXT;

-- CreateTable
CREATE TABLE "white_label_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "space_id" UUID NOT NULL,
    "event_id" UUID,
    "requested_by" UUID NOT NULL,
    "brand_color" VARCHAR(9),
    "brand_logo_url" TEXT,
    "reason" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "review_note" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "white_label_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "white_label_requests_space_id_idx" ON "white_label_requests"("space_id");

-- CreateIndex
CREATE INDEX "white_label_requests_event_id_idx" ON "white_label_requests"("event_id");

-- CreateIndex
CREATE INDEX "white_label_requests_requested_by_idx" ON "white_label_requests"("requested_by");

-- CreateIndex
CREATE INDEX "white_label_requests_status_idx" ON "white_label_requests"("status");

-- AddForeignKey
ALTER TABLE "white_label_requests" ADD CONSTRAINT "white_label_requests_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "white_label_requests" ADD CONSTRAINT "white_label_requests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "white_label_requests" ADD CONSTRAINT "white_label_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
