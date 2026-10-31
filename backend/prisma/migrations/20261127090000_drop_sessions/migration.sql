-- Unifesto Huddle sessions were retired in #501. Their tables held test data
-- only (checked on prod 1 Nov 2026: 3 test sales worth ₹1.05, no payouts, no
-- pending refunds), so they go, with T6's payout link and the plan flag.

-- Payouts draw from an event again, never a session (reverses T6).
ALTER TABLE "payouts" DROP CONSTRAINT IF EXISTS "payouts_one_source";
ALTER TABLE "payouts" DROP COLUMN "session_id";
ALTER TABLE "payouts" ALTER COLUMN "event_id" SET NOT NULL;

DROP TABLE "session_co_hosts";
DROP TABLE "session_registrations";
DROP TABLE "sessions";
DROP FUNCTION IF EXISTS stamp_session_platform_fee();

DROP TYPE "session_status";
DROP TYPE "session_visibility";
DROP TYPE "session_platform";

ALTER TABLE "plan_configs" DROP COLUMN "has_sessions";
-- Not in the Prisma schema, but it got the same flag in 20260721140000.
ALTER TABLE IF EXISTS "billing_model_configs" DROP COLUMN IF EXISTS "has_sessions";
