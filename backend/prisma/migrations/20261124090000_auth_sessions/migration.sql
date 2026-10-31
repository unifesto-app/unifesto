-- Linked devices: one row per sign-in. Tokens issued from now on carry its id
-- (`sid`); older tokens get a row on their next refresh.
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "user_agent" VARCHAR(400),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The sign-in that registered a push install: signing it out drops the install.
ALTER TABLE "user_push_devices" ADD COLUMN "session_id" UUID;

CREATE INDEX "user_push_devices_session_id_idx" ON "user_push_devices"("session_id");

ALTER TABLE "user_push_devices" ADD CONSTRAINT "user_push_devices_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
