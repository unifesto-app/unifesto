-- Unifesto Orbit: explicit Orbit Lead record per campus (top-level SUPER space).
CREATE TABLE "orbit_leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exam_pause_until" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "end_reason" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orbit_leads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "orbit_leads_space_id_idx" ON "orbit_leads"("space_id");
CREATE INDEX "orbit_leads_user_id_idx" ON "orbit_leads"("user_id");

-- One live Orbit Lead row per person per campus; ended rows are history.
CREATE UNIQUE INDEX "orbit_leads_live_space_user_key" ON "orbit_leads"("space_id", "user_id") WHERE "ended_at" IS NULL;

ALTER TABLE "orbit_leads" ADD CONSTRAINT "orbit_leads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "orbit_leads" ADD CONSTRAINT "orbit_leads_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
