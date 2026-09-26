-- Reason a registration was cancelled, surfaced on the organiser's attendee
-- detail page. Populated by the attendee-cancel, reconcile and admin-resolve
-- paths; NULL for live registrations and cleared when an organiser restores one.
ALTER TABLE "event_registrations"
  ADD COLUMN "cancellation_reason" TEXT;
