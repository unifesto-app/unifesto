-- J19: make the migration history match schema.prisma, so CI's replay + drift
-- check (prisma/known-drift.sql) no longer has to carry the `db push` era diff.
--
-- Written to be safe on a database that already matches the schema (production
-- is believed to): every statement is guarded and only acts on what differs.
-- Nothing drops a table or column or touches row data.
--   * Objects that only came from `db push` (admin_devices, users.gender,
--     user_identities.is_primary, registration_type.MIXED, 3 indexes, 3 FKs)
--     are created only when missing.
--   * FKs whose ON UPDATE is NO ACTION in the history but CASCADE in the
--     schema are swapped only when their definition differs. ON DELETE is
--     unchanged and ids are never updated, so behaviour is the same. Re-added
--     FKs go in NOT VALID, then validate; a validation failure (orphan rows)
--     only warns, so this can't fail a deploy.
--   * Indexes are renamed to Prisma's names only when the old name exists and
--     the new one doesn't.
--   * updated_at loses its DEFAULT now() (Prisma always sets @updatedAt).
--   * The old 3-column user_roles unique index from init is dropped if present:
--     the 4-column unique_user_role_scope replaced it on 2026-07-03.

ALTER TYPE "registration_type" ADD VALUE IF NOT EXISTS 'MIXED';

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gender" VARCHAR(30);
ALTER TABLE "user_identities" ADD COLUMN IF NOT EXISTS "is_primary" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "admin_devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "fcmToken" TEXT NOT NULL,
    "platform" VARCHAR(10) NOT NULL DEFAULT 'ios',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "admin_devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "admin_devices_fcmToken_key" ON "admin_devices"("fcmToken");

CREATE INDEX IF NOT EXISTS "event_checkin_records_checked_in_by_idx" ON "event_checkin_records"("checked_in_by");
CREATE INDEX IF NOT EXISTS "event_registrations_checked_in_by_idx" ON "event_registrations"("checked_in_by");
CREATE INDEX IF NOT EXISTS "leaderboard_scores_round_id_idx" ON "leaderboard_scores"("round_id");

DROP INDEX IF EXISTS "user_roles_user_id_role_id_space_id_key";

ALTER TABLE "billing_model_configs" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "incidents" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "notification_settings" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "plan_configs" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "platform_config" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "refund_requests" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "sessions" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "space_status_requests" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "support_tickets" ALTER COLUMN "updated_at" DROP DEFAULT;

DO $$
DECLARE
  r RECORD;
  cur TEXT;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    -- (table, old index name, Prisma's name)
    ('event_checkin_access_event_user_type_unique', 'event_checkin_access_event_id_user_id_checkin_type_id_key'),
    ('event_checkin_records_reg_type_unique', 'event_checkin_records_registration_id_checkin_type_id_key'),
    ('event_co_hosts_event_space_unique', 'event_co_hosts_event_id_space_id_key'),
    ('event_registrations_ticket_type_id_waitlist_status_waitlis_idx', 'event_registrations_ticket_type_id_waitlist_status_waitlist_idx'),
    ('event_registrations_waitlist_status_waitlist_offer_expires_idx', 'event_registrations_waitlist_status_waitlist_offer_expires__idx'),
    ('idx_space_status_requests_requested_by', 'space_status_requests_requested_by_idx'),
    ('idx_space_status_requests_space_id', 'space_status_requests_space_id_idx'),
    ('idx_space_status_requests_status', 'space_status_requests_status_idx'),
    ('unique_user_role_scope', 'user_roles_user_id_role_id_space_id_event_id_key')
  ) AS t(old_name, new_name) LOOP
    IF to_regclass('public.' || quote_ident(r.old_name)) IS NOT NULL
       AND to_regclass('public.' || quote_ident(r.new_name)) IS NULL THEN
      -- Renaming a constraint's index renames the constraint too.
      EXECUTE format('ALTER INDEX %I RENAME TO %I', r.old_name, r.new_name);
    END IF;
  END LOOP;

  FOR r IN SELECT * FROM (VALUES
    -- (table, constraint, definition exactly as pg_get_constraintdef prints it)
    ('admin_devices', 'admin_devices_userId_fkey', 'FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE'),
    ('event_checkin_access', 'event_checkin_access_checkin_type_id_fkey', 'FOREIGN KEY (checkin_type_id) REFERENCES event_checkin_types(id) ON UPDATE CASCADE ON DELETE CASCADE'),
    ('event_checkin_access', 'event_checkin_access_event_id_fkey', 'FOREIGN KEY (event_id) REFERENCES events(id) ON UPDATE CASCADE ON DELETE CASCADE'),
    ('event_checkin_access', 'event_checkin_access_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE'),
    ('event_checkin_records', 'event_checkin_records_checked_in_by_fkey', 'FOREIGN KEY (checked_in_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT'),
    ('event_checkin_records', 'event_checkin_records_checkin_type_id_fkey', 'FOREIGN KEY (checkin_type_id) REFERENCES event_checkin_types(id) ON UPDATE CASCADE ON DELETE CASCADE'),
    ('event_checkin_records', 'event_checkin_records_registration_id_fkey', 'FOREIGN KEY (registration_id) REFERENCES event_registrations(id) ON UPDATE CASCADE ON DELETE CASCADE'),
    ('event_checkin_types', 'event_checkin_types_event_id_fkey', 'FOREIGN KEY (event_id) REFERENCES events(id) ON UPDATE CASCADE ON DELETE CASCADE'),
    ('event_co_hosts', 'event_co_hosts_event_id_fkey', 'FOREIGN KEY (event_id) REFERENCES events(id) ON UPDATE CASCADE ON DELETE CASCADE'),
    ('event_co_hosts', 'event_co_hosts_space_id_fkey', 'FOREIGN KEY (space_id) REFERENCES spaces(id) ON UPDATE CASCADE ON DELETE CASCADE'),
    ('event_contacts', 'event_contacts_event_id_fkey', 'FOREIGN KEY (event_id) REFERENCES events(id) ON UPDATE CASCADE ON DELETE CASCADE'),
    ('event_faqs', 'event_faqs_event_id_fkey', 'FOREIGN KEY (event_id) REFERENCES events(id) ON UPDATE CASCADE ON DELETE CASCADE'),
    ('event_form_fields', 'event_form_fields_ticket_type_id_fkey', 'FOREIGN KEY (ticket_type_id) REFERENCES event_ticket_types(id) ON UPDATE CASCADE ON DELETE CASCADE'),
    ('event_prizes', 'event_prizes_event_id_fkey', 'FOREIGN KEY (event_id) REFERENCES events(id) ON UPDATE CASCADE ON DELETE CASCADE'),
    ('event_registrations', 'event_registrations_checked_in_by_fkey', 'FOREIGN KEY (checked_in_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL'),
    ('event_registrations', 'event_registrations_ticket_type_id_fkey', 'FOREIGN KEY (ticket_type_id) REFERENCES event_ticket_types(id) ON UPDATE CASCADE ON DELETE SET NULL'),
    ('notification_settings', 'notification_settings_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE'),
    ('refund_requests', 'refund_requests_requested_by_id_fkey', 'FOREIGN KEY (requested_by_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT'),
    ('refund_requests', 'refund_requests_support_ticket_id_fkey', 'FOREIGN KEY (support_ticket_id) REFERENCES support_tickets(id) ON UPDATE CASCADE ON DELETE SET NULL'),
    ('sessions', 'sessions_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT'),
    ('sessions', 'sessions_space_id_fkey', 'FOREIGN KEY (space_id) REFERENCES spaces(id) ON UPDATE CASCADE ON DELETE CASCADE'),
    ('space_status_requests', 'space_status_requests_requested_by_fkey', 'FOREIGN KEY (requested_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT'),
    ('space_status_requests', 'space_status_requests_space_id_fkey', 'FOREIGN KEY (space_id) REFERENCES spaces(id) ON UPDATE CASCADE ON DELETE CASCADE'),
    ('support_messages', 'support_messages_author_id_fkey', 'FOREIGN KEY (author_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE'),
    ('support_messages', 'support_messages_ticket_id_fkey', 'FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON UPDATE CASCADE ON DELETE CASCADE'),
    ('support_tickets', 'support_tickets_assigned_to_id_fkey', 'FOREIGN KEY (assigned_to_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL'),
    ('support_tickets', 'support_tickets_requester_id_fkey', 'FOREIGN KEY (requester_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE'),
    ('support_tickets', 'support_tickets_space_id_fkey', 'FOREIGN KEY (space_id) REFERENCES spaces(id) ON UPDATE CASCADE ON DELETE SET NULL')
  ) AS t(tbl, con, def) LOOP
    SELECT pg_get_constraintdef(c.oid) INTO cur
      FROM pg_constraint c
     WHERE c.conname = r.con AND c.conrelid = to_regclass('public.' || quote_ident(r.tbl));
    CONTINUE WHEN cur = r.def;
    IF cur IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.tbl, r.con);
    END IF;
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s NOT VALID', r.tbl, r.con, r.def);
    BEGIN
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', r.tbl, r.con);
    EXCEPTION WHEN foreign_key_violation THEN
      RAISE WARNING '%.% has orphan rows; left NOT VALID (enforced for new rows only)', r.tbl, r.con;
    END;
  END LOOP;
END $$;
