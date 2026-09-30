-- Hidden tickets: an attendee can delete a finished ticket from their own
-- ticket list. Only their view changes; the registration row is untouched.
-- Additive only: one new table.
-- CreateTable
CREATE TABLE "hidden_tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "hidden_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hidden_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hidden_tickets_user_id_registration_id_key" ON "hidden_tickets"("user_id", "registration_id");

-- CreateIndex
CREATE INDEX "hidden_tickets_registration_id_idx" ON "hidden_tickets"("registration_id");

-- AddForeignKey
ALTER TABLE "hidden_tickets" ADD CONSTRAINT "hidden_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hidden_tickets" ADD CONSTRAINT "hidden_tickets_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
