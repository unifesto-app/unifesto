-- IAM: make the capability matrix editable (Platform Admin "Access Management").
--
-- The roles x actions matrix used to live only in code
-- (backend/src/auth/authorization/capabilities.ts). This table is its
-- DB-backed twin — the same pattern that made plan feature flags editable via
-- `plan_configs`. Rows are read into an in-memory cache at boot
-- (CapabilityConfigService) and edited from the Apex IAM console.
--
-- ADMIN is intentionally absent from the seed: platform-admin power is an
-- inheritance rule in AuthorizationService, not a matrix row, so nothing an
-- admin toggles in this table can ever lock the platform superuser out.

-- CreateTable
CREATE TABLE "role_capabilities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role_code" "role_code" NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "role_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_capabilities_role_code_action_key" ON "role_capabilities"("role_code", "action");

-- CreateIndex
CREATE INDEX "role_capabilities_role_code_idx" ON "role_capabilities"("role_code");

-- Seed the current matrix verbatim from capabilities.ts so authorization
-- behaviour is byte-identical the moment this migration lands. ON CONFLICT keeps
-- it idempotent and safe to re-run. `updated_at` is set explicitly (no default).
INSERT INTO "role_capabilities" ("role_code", "action", "updated_at") VALUES
    -- SPACE_ADMIN — runs a Space.
    ('SPACE_ADMIN', 'space:view', CURRENT_TIMESTAMP),
    ('SPACE_ADMIN', 'space:manage-billing', CURRENT_TIMESTAMP),
    ('SPACE_ADMIN', 'space:manage-members', CURRENT_TIMESTAMP),
    ('SPACE_ADMIN', 'space:manage-money', CURRENT_TIMESTAMP),
    ('SPACE_ADMIN', 'space:manage-settings', CURRENT_TIMESTAMP),
    ('SPACE_ADMIN', 'space:create-event', CURRENT_TIMESTAMP),
    -- CURATOR — owns one event end-to-end.
    ('CURATOR', 'event:view', CURRENT_TIMESTAMP),
    ('CURATOR', 'event:edit', CURRENT_TIMESTAMP),
    ('CURATOR', 'event:publish', CURRENT_TIMESTAMP),
    ('CURATOR', 'event:cancel', CURRENT_TIMESTAMP),
    ('CURATOR', 'event:manage-money', CURRENT_TIMESTAMP),
    ('CURATOR', 'event:assign-crew', CURRENT_TIMESTAMP),
    ('CURATOR', 'event:check-in', CURRENT_TIMESTAMP),
    -- CO_CURATOR — helps run an event; no publish/cancel/money.
    ('CO_CURATOR', 'event:view', CURRENT_TIMESTAMP),
    ('CO_CURATOR', 'event:edit', CURRENT_TIMESTAMP),
    ('CO_CURATOR', 'event:assign-crew', CURRENT_TIMESTAMP),
    ('CO_CURATOR', 'event:check-in', CURRENT_TIMESTAMP),
    -- CREW — check-in only.
    ('CREW', 'event:view', CURRENT_TIMESTAMP),
    ('CREW', 'event:check-in', CURRENT_TIMESTAMP),
    -- Legacy shims (removed after the P2.2 backfill) — kept in lockstep with
    -- the compiled matrix so un-migrated rows keep working.
    ('ORGANISER', 'space:view', CURRENT_TIMESTAMP),
    ('ORGANISER', 'space:manage-billing', CURRENT_TIMESTAMP),
    ('ORGANISER', 'space:manage-members', CURRENT_TIMESTAMP),
    ('ORGANISER', 'space:manage-money', CURRENT_TIMESTAMP),
    ('ORGANISER', 'space:manage-settings', CURRENT_TIMESTAMP),
    ('ORGANISER', 'space:create-event', CURRENT_TIMESTAMP),
    ('CO_ORGANISER', 'space:view', CURRENT_TIMESTAMP),
    ('CO_ORGANISER', 'space:manage-members', CURRENT_TIMESTAMP),
    ('CO_ORGANISER', 'space:manage-settings', CURRENT_TIMESTAMP),
    ('CO_ORGANISER', 'space:create-event', CURRENT_TIMESTAMP),
    ('VOLUNTEER', 'event:view', CURRENT_TIMESTAMP),
    ('VOLUNTEER', 'event:check-in', CURRENT_TIMESTAMP)
ON CONFLICT ("role_code", "action") DO NOTHING;
