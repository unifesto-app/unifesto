-- One processing fee per paid ticket (12 Nov 2026): a plan with
-- processing_fee_percent set charges that one rate (it includes the 2.5%
-- payment gateway), with no per-ticket cap, and no organiser fee: the plan's
-- platform_fee_percent must be 0, so the stamp triggers freeze 0 on its sales.
-- NULL = the old rate card (4% buyer fee capped at ₹99 + the organiser fee),
-- so nothing changes until an admin sets a rate in Apex › Plans.
ALTER TABLE "plan_configs" ADD COLUMN "processing_fee_percent" DECIMAL(5, 2);
