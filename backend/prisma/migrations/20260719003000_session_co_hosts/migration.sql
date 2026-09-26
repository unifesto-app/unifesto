-- Per-session co-hosts (guest hosts for a single session).
CREATE TABLE "session_co_hosts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "session_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "session_co_hosts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "session_co_hosts_session_id_user_id_key" ON "session_co_hosts"("session_id", "user_id");
CREATE INDEX "session_co_hosts_session_id_idx" ON "session_co_hosts"("session_id");
CREATE INDEX "session_co_hosts_user_id_idx" ON "session_co_hosts"("user_id");

ALTER TABLE "session_co_hosts"
  ADD CONSTRAINT "session_co_hosts_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "session_co_hosts"
  ADD CONSTRAINT "session_co_hosts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
