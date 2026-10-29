-- E3: a sponsor tracks its own follow-up on each lead (same statuses as the
-- space lead funnel). Additive, with a default: safe on a live table.
ALTER TABLE "sponsor_leads" ADD COLUMN "status" "lead_status" NOT NULL DEFAULT 'NEW';
