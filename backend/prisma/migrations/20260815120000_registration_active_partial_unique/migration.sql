-- Relax the (event_id, user_id, ticket_type_id) uniqueness so it applies only
-- to ACTIVE registrations. Historical REFUNDED and CANCELLED rows are exempt,
-- letting a refunded/cancelled attendee register again for the same ticket type
-- without deleting their prior row (its refund record cascades off that row and
-- must survive) and without corrupting the cash-accurate financial roll-ups
-- (each real collection stays a distinct row).
--
-- The uniqueness is enforced by a TABLE CONSTRAINT (ADD CONSTRAINT ... UNIQUE),
-- so it must be dropped with ALTER TABLE DROP CONSTRAINT — DROP INDEX is refused
-- while the constraint depends on the index. Dropping the constraint drops its
-- backing index too. Names are dropped IF EXISTS defensively: the current 3-col
-- key, plus the historical 2-col key that predated ticket_type_id (which may
-- survive as either a constraint or a bare index depending on how it was made).
ALTER TABLE "event_registrations"
  DROP CONSTRAINT IF EXISTS "event_registrations_event_id_user_id_ticket_type_id_key";
ALTER TABLE "event_registrations"
  DROP CONSTRAINT IF EXISTS "event_registrations_event_id_user_id_key";
DROP INDEX IF EXISTS "event_registrations_event_id_user_id_ticket_type_id_key";
DROP INDEX IF EXISTS "event_registrations_event_id_user_id_key";

-- A partial unique index enforces at most one live ticket of a given type per
-- user per event. PARTIALLY_REFUNDED is intentionally NOT exempt: the attendee
-- still holds (part of) that ticket, so they must not double-register.
CREATE UNIQUE INDEX "event_registrations_active_ticket_key"
  ON "event_registrations" ("event_id", "user_id", "ticket_type_id")
  WHERE "payment_status" <> 'REFUNDED' AND "status" <> 'CANCELLED';
