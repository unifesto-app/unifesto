-- D19: saved replies for the Assist desks (no space = the Unifesto desk).
CREATE TABLE "canned_replies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "space_id" UUID,
    "title" VARCHAR(100) NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "canned_replies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "canned_replies_space_id_idx" ON "canned_replies"("space_id");

ALTER TABLE "canned_replies" ADD CONSTRAINT "canned_replies_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
