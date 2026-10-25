-- AlterEnum
ALTER TYPE "registration_type" ADD VALUE 'MIXED';

-- DropForeignKey
ALTER TABLE "event_checkin_access" DROP CONSTRAINT "event_checkin_access_checkin_type_id_fkey";

-- DropForeignKey
ALTER TABLE "event_checkin_access" DROP CONSTRAINT "event_checkin_access_event_id_fkey";

-- DropForeignKey
ALTER TABLE "event_checkin_access" DROP CONSTRAINT "event_checkin_access_user_id_fkey";

-- DropForeignKey
ALTER TABLE "event_checkin_records" DROP CONSTRAINT "event_checkin_records_checkin_type_id_fkey";

-- DropForeignKey
ALTER TABLE "event_checkin_records" DROP CONSTRAINT "event_checkin_records_registration_id_fkey";

-- DropForeignKey
ALTER TABLE "event_checkin_types" DROP CONSTRAINT "event_checkin_types_event_id_fkey";

-- DropForeignKey
ALTER TABLE "event_co_hosts" DROP CONSTRAINT "event_co_hosts_event_id_fkey";

-- DropForeignKey
ALTER TABLE "event_co_hosts" DROP CONSTRAINT "event_co_hosts_space_id_fkey";

-- DropForeignKey
ALTER TABLE "event_contacts" DROP CONSTRAINT "event_contacts_event_id_fkey";

-- DropForeignKey
ALTER TABLE "event_faqs" DROP CONSTRAINT "event_faqs_event_id_fkey";

-- DropForeignKey
ALTER TABLE "event_form_fields" DROP CONSTRAINT "event_form_fields_ticket_type_id_fkey";

-- DropForeignKey
ALTER TABLE "event_prizes" DROP CONSTRAINT "event_prizes_event_id_fkey";

-- DropForeignKey
ALTER TABLE "event_registrations" DROP CONSTRAINT "event_registrations_ticket_type_id_fkey";

-- DropForeignKey
ALTER TABLE "notification_settings" DROP CONSTRAINT "notification_settings_user_id_fkey";

-- DropForeignKey
ALTER TABLE "refund_requests" DROP CONSTRAINT "refund_requests_requested_by_id_fkey";

-- DropForeignKey
ALTER TABLE "refund_requests" DROP CONSTRAINT "refund_requests_support_ticket_id_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_created_by_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_space_id_fkey";

-- DropForeignKey
ALTER TABLE "space_status_requests" DROP CONSTRAINT "space_status_requests_requested_by_fkey";

-- DropForeignKey
ALTER TABLE "space_status_requests" DROP CONSTRAINT "space_status_requests_space_id_fkey";

-- DropForeignKey
ALTER TABLE "support_messages" DROP CONSTRAINT "support_messages_author_id_fkey";

-- DropForeignKey
ALTER TABLE "support_messages" DROP CONSTRAINT "support_messages_ticket_id_fkey";

-- DropForeignKey
ALTER TABLE "support_tickets" DROP CONSTRAINT "support_tickets_assigned_to_id_fkey";

-- DropForeignKey
ALTER TABLE "support_tickets" DROP CONSTRAINT "support_tickets_requester_id_fkey";

-- DropForeignKey
ALTER TABLE "support_tickets" DROP CONSTRAINT "support_tickets_space_id_fkey";

-- DropIndex
DROP INDEX "api_logs_path_prefix_idx";

-- DropIndex
DROP INDEX "user_roles_user_id_role_id_space_id_key";

-- AlterTable
ALTER TABLE "billing_model_configs" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "incidents" ALTER COLUMN "affected_services" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "notification_settings" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "plan_configs" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "platform_config" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "refund_requests" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "space_status_requests" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "support_tickets" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user_identities" ADD COLUMN     "is_primary" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "gender" VARCHAR(30);

-- CreateTable
CREATE TABLE "admin_devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "fcmToken" TEXT NOT NULL,
    "platform" VARCHAR(10) NOT NULL DEFAULT 'ios',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "admin_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_devices_fcmToken_key" ON "admin_devices"("fcmToken");

-- CreateIndex
CREATE INDEX "api_logs_path_prefix_idx" ON "api_logs"("path" text_pattern_ops);

-- CreateIndex
CREATE INDEX "event_checkin_records_checked_in_by_idx" ON "event_checkin_records"("checked_in_by");

-- CreateIndex
CREATE INDEX "event_registrations_checked_in_by_idx" ON "event_registrations"("checked_in_by");

-- CreateIndex
CREATE INDEX "leaderboard_scores_round_id_idx" ON "leaderboard_scores"("round_id");

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_status_requests" ADD CONSTRAINT "space_status_requests_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_status_requests" ADD CONSTRAINT "space_status_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_prizes" ADD CONSTRAINT "event_prizes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_contacts" ADD CONSTRAINT "event_contacts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_faqs" ADD CONSTRAINT "event_faqs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_form_fields" ADD CONSTRAINT "event_form_fields_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "event_ticket_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "event_ticket_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_checkin_access" ADD CONSTRAINT "event_checkin_access_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_checkin_access" ADD CONSTRAINT "event_checkin_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_checkin_access" ADD CONSTRAINT "event_checkin_access_checkin_type_id_fkey" FOREIGN KEY ("checkin_type_id") REFERENCES "event_checkin_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_checkin_types" ADD CONSTRAINT "event_checkin_types_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_checkin_records" ADD CONSTRAINT "event_checkin_records_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_checkin_records" ADD CONSTRAINT "event_checkin_records_checkin_type_id_fkey" FOREIGN KEY ("checkin_type_id") REFERENCES "event_checkin_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_checkin_records" ADD CONSTRAINT "event_checkin_records_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_co_hosts" ADD CONSTRAINT "event_co_hosts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_co_hosts" ADD CONSTRAINT "event_co_hosts_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_devices" ADD CONSTRAINT "admin_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_support_ticket_id_fkey" FOREIGN KEY ("support_ticket_id") REFERENCES "support_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "event_checkin_access_event_user_type_unique" RENAME TO "event_checkin_access_event_id_user_id_checkin_type_id_key";

-- RenameIndex
ALTER INDEX "event_checkin_records_reg_type_unique" RENAME TO "event_checkin_records_registration_id_checkin_type_id_key";

-- RenameIndex
ALTER INDEX "event_co_hosts_event_space_unique" RENAME TO "event_co_hosts_event_id_space_id_key";

-- RenameIndex
ALTER INDEX "event_registrations_ticket_type_id_waitlist_status_waitlis_idx" RENAME TO "event_registrations_ticket_type_id_waitlist_status_waitlist_idx";

-- RenameIndex
ALTER INDEX "event_registrations_waitlist_status_waitlist_offer_expires_idx" RENAME TO "event_registrations_waitlist_status_waitlist_offer_expires__idx";

-- RenameIndex
ALTER INDEX "idx_space_status_requests_requested_by" RENAME TO "space_status_requests_requested_by_idx";

-- RenameIndex
ALTER INDEX "idx_space_status_requests_space_id" RENAME TO "space_status_requests_space_id_idx";

-- RenameIndex
ALTER INDEX "idx_space_status_requests_status" RENAME TO "space_status_requests_status_idx";

-- RenameIndex
ALTER INDEX "unique_user_role_scope" RENAME TO "user_roles_user_id_role_id_space_id_event_id_key";

