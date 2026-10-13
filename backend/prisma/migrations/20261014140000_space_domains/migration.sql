-- White-label P2/P3: domains a space owns (email sending + custom web host).
-- Additive only.
CREATE TYPE "DomainKind" AS ENUM ('WEB', 'EMAIL');

CREATE TABLE "space_domains" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "space_id" UUID NOT NULL,
    "kind" "DomainKind" NOT NULL,
    "hostname" VARCHAR(253) NOT NULL,
    "email_local_part" VARCHAR(64),
    "provider_id" VARCHAR(100),
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "records" JSONB NOT NULL DEFAULT '[]',
    "verified_at" TIMESTAMPTZ(6),
    "last_checked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "space_domains_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "space_domains_hostname_key" ON "space_domains"("hostname");
CREATE UNIQUE INDEX "space_domains_space_id_kind_key" ON "space_domains"("space_id", "kind");

ALTER TABLE "space_domains" ADD CONSTRAINT "space_domains_space_id_fkey"
  FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
