-- CreateTable
CREATE TABLE "event_group_member_checkins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "registration_id" UUID NOT NULL,
    "member_index" INTEGER NOT NULL,
    "checkin_type_id" UUID NOT NULL,
    "checked_in_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_in_by" UUID NOT NULL,

    CONSTRAINT "event_group_member_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_group_member_checkins_registration_id_member_index_ch_key" ON "event_group_member_checkins"("registration_id", "member_index", "checkin_type_id");

-- CreateIndex
CREATE INDEX "event_group_member_checkins_checkin_type_id_idx" ON "event_group_member_checkins"("checkin_type_id");

-- CreateIndex
CREATE INDEX "event_group_member_checkins_registration_id_idx" ON "event_group_member_checkins"("registration_id");

-- CreateIndex
CREATE INDEX "event_group_member_checkins_checked_in_by_idx" ON "event_group_member_checkins"("checked_in_by");

-- AddForeignKey
ALTER TABLE "event_group_member_checkins" ADD CONSTRAINT "event_group_member_checkins_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_group_member_checkins" ADD CONSTRAINT "event_group_member_checkins_checkin_type_id_fkey" FOREIGN KEY ("checkin_type_id") REFERENCES "event_checkin_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_group_member_checkins" ADD CONSTRAINT "event_group_member_checkins_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
