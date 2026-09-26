-- IAM for Spaces: per-space overrides of the capability matrix.
--
-- A Space Admin can tune what their event roles (Curator / Co-Curator / Crew)
-- may do within their space. Semantics mirror the global fallback: if a
-- (space, role) pair has any rows, that set is authoritative for that role in
-- that space; no rows means the role inherits the global `role_capabilities`.
--
-- The table starts EMPTY on purpose — every space inherits the platform default
-- until an admin customises a role. SPACE_ADMIN is never written here and
-- `event:manage-money` is never written here; both are enforced in the service,
-- not the schema.

-- CreateTable
CREATE TABLE "space_role_capabilities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "space_id" UUID NOT NULL,
    "role_code" "role_code" NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "space_role_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "space_role_capabilities_space_id_role_code_action_key" ON "space_role_capabilities"("space_id", "role_code", "action");

-- CreateIndex
CREATE INDEX "space_role_capabilities_space_id_idx" ON "space_role_capabilities"("space_id");

-- AddForeignKey
ALTER TABLE "space_role_capabilities" ADD CONSTRAINT "space_role_capabilities_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
