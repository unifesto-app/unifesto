-- Unifesto Orbit: applications from unifesto.app/orbit/apply.
CREATE TABLE "orbit_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "space_id" UUID,
    "college_name" VARCHAR(200) NOT NULL,
    "year_of_study" VARCHAR(60) NOT NULL,
    "my_clubs" TEXT NOT NULL,
    "campus_clubs" TEXT NOT NULL,
    "why" TEXT NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "review_note" VARCHAR(500),
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orbit_applications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "orbit_applications_status_idx" ON "orbit_applications"("status");
CREATE INDEX "orbit_applications_user_id_idx" ON "orbit_applications"("user_id");

-- One open application per person; decided ones stay as history.
CREATE UNIQUE INDEX "orbit_applications_pending_user_key" ON "orbit_applications"("user_id") WHERE "status" = 'PENDING';

ALTER TABLE "orbit_applications" ADD CONSTRAINT "orbit_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "orbit_applications" ADD CONSTRAINT "orbit_applications_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
