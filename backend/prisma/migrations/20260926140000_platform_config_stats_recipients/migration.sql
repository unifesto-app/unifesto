-- Unifesto Stats recipients move from the UNIFESTO_STATS_RECIPIENTS env var to
-- an admin-editable list on the platform_config singleton.
ALTER TABLE "platform_config" ADD COLUMN IF NOT EXISTS "stats_recipients" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Carry over the numbers that were configured in the env var, so the broadcast
-- keeps reaching the same people after the switch. Only fills an empty list.
UPDATE "platform_config"
SET "stats_recipients" = ARRAY['+919848945690', '+918520045690']
WHERE "id" = 'global' AND cardinality("stats_recipients") = 0;
