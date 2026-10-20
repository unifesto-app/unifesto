-- Unifesto Orbit: Crew members alongside Leads (LEAD | CREW). Existing rows are Leads.
ALTER TABLE "orbit_leads" ADD COLUMN "role" VARCHAR(10) NOT NULL DEFAULT 'LEAD';
