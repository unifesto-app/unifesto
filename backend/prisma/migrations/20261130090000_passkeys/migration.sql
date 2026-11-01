-- Passkeys (WebAuthn): add, list, remove, sign in. Additive only.
CREATE TABLE "passkeys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "credential_id" VARCHAR(1024) NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "passkeys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "passkeys_credential_id_key" ON "passkeys"("credential_id");
CREATE INDEX "passkeys_user_id_idx" ON "passkeys"("user_id");

ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
