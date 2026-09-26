-- Interactive vs broadcast toggle + LiveKit Egress recording tracking for
-- UNIFESTO_LIVE sessions.

ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "interactive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "recording_egress_id" TEXT;
