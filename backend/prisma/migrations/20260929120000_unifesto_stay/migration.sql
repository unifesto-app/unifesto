-- Unifesto Stay: accommodation the event team offers attendees. A stay is one
-- property; its options are pools of beds with a price; a booking holds beds
-- for a range of nights and carries the Stay Pass code.
CREATE TYPE "stay_property_type" AS ENUM ('HOSTEL', 'HOTEL', 'DORMITORY', 'GUEST_HOUSE', 'HOMESTAY', 'OTHER');
CREATE TYPE "stay_gender" AS ENUM ('ANY', 'MALE', 'FEMALE');
CREATE TYPE "stay_payment_mode" AS ENUM ('FREE', 'PAY_AT_PROPERTY', 'ONLINE');
CREATE TYPE "stay_pricing" AS ENUM ('PER_NIGHT', 'PER_STAY');
CREATE TYPE "stay_booking_status" AS ENUM ('PENDING', 'AWAITING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'REJECTED', 'CANCELLED', 'EXPIRED');

CREATE TABLE "stays" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "property_type" "stay_property_type" NOT NULL DEFAULT 'HOSTEL',
    "description" TEXT,
    "cover_image_url" TEXT,
    "address" TEXT,
    "city" VARCHAR(100),
    "map_url" TEXT,
    "amenities" TEXT[],
    "house_rules" TEXT,
    "contact_name" VARCHAR(120),
    "contact_phone" VARCHAR(20),
    "check_in_from" DATE NOT NULL,
    "check_out_until" DATE NOT NULL,
    "check_in_time" VARCHAR(20),
    "check_out_time" VARCHAR(20),
    "require_id_proof" BOOLEAN NOT NULL DEFAULT true,
    "payment_window_hours" INTEGER NOT NULL DEFAULT 48,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "stays_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stay_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stay_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "gender" "stay_gender" NOT NULL DEFAULT 'ANY',
    "total_beds" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "pricing" "stay_pricing" NOT NULL DEFAULT 'PER_NIGHT',
    "payment_mode" "stay_payment_mode" NOT NULL DEFAULT 'FREE',
    "max_guests" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stay_options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stay_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stay_id" UUID NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "type" "form_field_type" NOT NULL,
    "options" TEXT[],
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "help_text" VARCHAR(500),
    "config" JSONB,
    "show_if" JSONB,
    CONSTRAINT "stay_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stay_bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stay_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "registration_id" UUID,
    "status" "stay_booking_status" NOT NULL DEFAULT 'PENDING',
    "check_in_date" DATE NOT NULL,
    "check_out_date" DATE NOT NULL,
    "nights" INTEGER NOT NULL,
    "guest_count" INTEGER NOT NULL,
    "arrival_at" TIMESTAMPTZ(6),
    "emergency_name" VARCHAR(120),
    "emergency_phone" VARCHAR(20),
    "note" TEXT,
    "answers" JSONB,
    "payment_mode" "stay_payment_mode" NOT NULL,
    "base_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "processing_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payment_status" "payment_status",
    "payment_id" VARCHAR(255),
    "order_id" VARCHAR(255),
    "paid_at" TIMESTAMPTZ(6),
    "refunded_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payment_due_at" TIMESTAMPTZ(6),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "allocation" VARCHAR(200),
    "staff_note" TEXT,
    "pass_code" VARCHAR(20) NOT NULL,
    "checked_in_at" TIMESTAMPTZ(6),
    "checked_in_by_id" UUID,
    "checked_out_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by_id" UUID,
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "stay_bookings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stay_guests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "gender" VARCHAR(10) NOT NULL,
    "is_booker" BOOLEAN NOT NULL DEFAULT false,
    "id_proof" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "stay_guests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stays_event_id_idx" ON "stays"("event_id");
CREATE INDEX "stay_options_stay_id_idx" ON "stay_options"("stay_id");
CREATE INDEX "stay_questions_stay_id_idx" ON "stay_questions"("stay_id");
CREATE UNIQUE INDEX "stay_bookings_pass_code_key" ON "stay_bookings"("pass_code");
CREATE INDEX "stay_bookings_event_id_status_idx" ON "stay_bookings"("event_id", "status");
CREATE INDEX "stay_bookings_stay_id_idx" ON "stay_bookings"("stay_id");
CREATE INDEX "stay_bookings_option_id_status_idx" ON "stay_bookings"("option_id", "status");
CREATE INDEX "stay_bookings_user_id_idx" ON "stay_bookings"("user_id");
CREATE INDEX "stay_bookings_registration_id_idx" ON "stay_bookings"("registration_id");
CREATE INDEX "stay_bookings_order_id_idx" ON "stay_bookings"("order_id");
CREATE INDEX "stay_bookings_status_payment_due_at_idx" ON "stay_bookings"("status", "payment_due_at");
CREATE INDEX "stay_guests_booking_id_idx" ON "stay_guests"("booking_id");

ALTER TABLE "stays" ADD CONSTRAINT "stays_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stay_options" ADD CONSTRAINT "stay_options_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "stays"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stay_questions" ADD CONSTRAINT "stay_questions_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "stays"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stay_bookings" ADD CONSTRAINT "stay_bookings_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "stays"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stay_bookings" ADD CONSTRAINT "stay_bookings_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "stay_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stay_bookings" ADD CONSTRAINT "stay_bookings_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stay_bookings" ADD CONSTRAINT "stay_bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stay_bookings" ADD CONSTRAINT "stay_bookings_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stay_guests" ADD CONSTRAINT "stay_guests_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "stay_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
