-- L4: projector display link. Additive only: one nullable column.
ALTER TABLE "events" ADD COLUMN "display_token" VARCHAR(64);
