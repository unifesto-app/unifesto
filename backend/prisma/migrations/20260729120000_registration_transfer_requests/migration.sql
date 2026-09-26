-- Registration transfer requests
--
-- Organisers can no longer transfer tickets directly — they raise a request an
-- admin approves (which performs the transfer) or rejects. Admins may also
-- transfer directly without a request. Mirrors white_label_requests.

-- CreateTable
CREATE TABLE "registration_transfer_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "registration_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "target_email" VARCHAR(255) NOT NULL,
    "reason" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "review_note" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "registration_transfer_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registration_transfer_requests_registration_id_idx" ON "registration_transfer_requests"("registration_id");

-- CreateIndex
CREATE INDEX "registration_transfer_requests_requested_by_idx" ON "registration_transfer_requests"("requested_by");

-- CreateIndex
CREATE INDEX "registration_transfer_requests_status_idx" ON "registration_transfer_requests"("status");

-- AddForeignKey
ALTER TABLE "registration_transfer_requests" ADD CONSTRAINT "registration_transfer_requests_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_transfer_requests" ADD CONSTRAINT "registration_transfer_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
