-- K22: registration API keys, off per space until a Platform Admin turns them on.
ALTER TABLE "spaces" ADD COLUMN "integrations_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "space_api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "space_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "prefix" VARCHAR(16) NOT NULL,
    "key_hash" CHAR(64) NOT NULL,
    "created_by" UUID NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "space_api_keys_key_hash_key" ON "space_api_keys"("key_hash");
CREATE INDEX "space_api_keys_space_id_idx" ON "space_api_keys"("space_id");

ALTER TABLE "space_api_keys" ADD CONSTRAINT "space_api_keys_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Space Admins manage the keys. capability-config reads role_capabilities as the
-- source of truth once it has rows, so the grant has to land here too.
INSERT INTO "role_capabilities" ("role_code", "action", "updated_at") VALUES
    ('SPACE_ADMIN', 'space:manage-integrations', CURRENT_TIMESTAMP)
ON CONFLICT ("role_code", "action") DO NOTHING;
