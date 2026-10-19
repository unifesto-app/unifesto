-- A29: money rows never go with what they sit under. These foreign keys were
-- ON DELETE CASCADE, so deleting an event, session, space or user (or a stay or
-- registration) silently took paid registrations, refund requests, stay
-- bookings and extra-seat payments with it. RESTRICT makes the database refuse;
-- the app's deleteWithoutMoney guard clears unpaid rows first and turns a
-- refusal into a clear error. No data changes. NOT VALID + VALIDATE keeps the
-- lock short: every row already satisfies the key.

ALTER TABLE "event_registrations" DROP CONSTRAINT "event_registrations_event_id_fkey",
  ADD CONSTRAINT "event_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "event_registrations" VALIDATE CONSTRAINT "event_registrations_event_id_fkey";

ALTER TABLE "event_registrations" DROP CONSTRAINT "event_registrations_user_id_fkey",
  ADD CONSTRAINT "event_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "event_registrations" VALIDATE CONSTRAINT "event_registrations_user_id_fkey";

ALTER TABLE "refund_requests" DROP CONSTRAINT "refund_requests_event_id_fkey",
  ADD CONSTRAINT "refund_requests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "refund_requests" VALIDATE CONSTRAINT "refund_requests_event_id_fkey";

ALTER TABLE "refund_requests" DROP CONSTRAINT "refund_requests_registration_id_fkey",
  ADD CONSTRAINT "refund_requests_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "refund_requests" VALIDATE CONSTRAINT "refund_requests_registration_id_fkey";

ALTER TABLE "stay_bookings" DROP CONSTRAINT "stay_bookings_stay_id_fkey",
  ADD CONSTRAINT "stay_bookings_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "stays"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "stay_bookings" VALIDATE CONSTRAINT "stay_bookings_stay_id_fkey";

ALTER TABLE "stay_bookings" DROP CONSTRAINT "stay_bookings_event_id_fkey",
  ADD CONSTRAINT "stay_bookings_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "stay_bookings" VALIDATE CONSTRAINT "stay_bookings_event_id_fkey";

ALTER TABLE "stay_bookings" DROP CONSTRAINT "stay_bookings_user_id_fkey",
  ADD CONSTRAINT "stay_bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "stay_bookings" VALIDATE CONSTRAINT "stay_bookings_user_id_fkey";

ALTER TABLE "group_seat_purchases" DROP CONSTRAINT "group_seat_purchases_registration_id_fkey",
  ADD CONSTRAINT "group_seat_purchases_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "group_seat_purchases" VALIDATE CONSTRAINT "group_seat_purchases_registration_id_fkey";

ALTER TABLE "group_seat_purchases" DROP CONSTRAINT "group_seat_purchases_user_id_fkey",
  ADD CONSTRAINT "group_seat_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "group_seat_purchases" VALIDATE CONSTRAINT "group_seat_purchases_user_id_fkey";

ALTER TABLE "session_registrations" DROP CONSTRAINT "session_registrations_session_id_fkey",
  ADD CONSTRAINT "session_registrations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "session_registrations" VALIDATE CONSTRAINT "session_registrations_session_id_fkey";

ALTER TABLE "session_registrations" DROP CONSTRAINT "session_registrations_user_id_fkey",
  ADD CONSTRAINT "session_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "session_registrations" VALIDATE CONSTRAINT "session_registrations_user_id_fkey";

