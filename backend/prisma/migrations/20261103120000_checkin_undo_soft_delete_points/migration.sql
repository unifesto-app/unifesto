-- G10: additive only. Deleting a check-in point becomes a soft delete (its
-- history and queued offline scans survive), and undone check-ins are audited.

-- AlterTable
ALTER TABLE "event_checkin_types" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "event_checkin_undos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "registration_id" UUID NOT NULL,
    "checkin_type_id" UUID NOT NULL,
    "member_index" INTEGER,
    "checked_in_at" TIMESTAMPTZ(6) NOT NULL,
    "checked_in_by" UUID NOT NULL,
    "undone_by" UUID NOT NULL,
    "undone_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" VARCHAR(500),
    CONSTRAINT "event_checkin_undos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_checkin_undos_registration_id_idx" ON "event_checkin_undos"("registration_id");

-- CreateIndex
CREATE INDEX "event_checkin_undos_checkin_type_id_idx" ON "event_checkin_undos"("checkin_type_id");

-- AddForeignKey
ALTER TABLE "event_checkin_undos" ADD CONSTRAINT "event_checkin_undos_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_checkin_undos" ADD CONSTRAINT "event_checkin_undos_checkin_type_id_fkey" FOREIGN KEY ("checkin_type_id") REFERENCES "event_checkin_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
