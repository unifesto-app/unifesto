-- Registration questions (4.0.0 item 0.9): seven new question types, help
-- text, per-type answer limits, show-if conditions, and a purge marker for
-- uploaded files. Additive only; existing questions and answers are untouched.
ALTER TYPE "form_field_type" ADD VALUE IF NOT EXISTS 'DATE';
ALTER TYPE "form_field_type" ADD VALUE IF NOT EXISTS 'URL';
ALTER TYPE "form_field_type" ADD VALUE IF NOT EXISTS 'YES_NO';
ALTER TYPE "form_field_type" ADD VALUE IF NOT EXISTS 'FILE';
ALTER TYPE "form_field_type" ADD VALUE IF NOT EXISTS 'SECTION';
ALTER TYPE "form_field_type" ADD VALUE IF NOT EXISTS 'STATE';
ALTER TYPE "form_field_type" ADD VALUE IF NOT EXISTS 'RATING';

ALTER TABLE "event_form_fields" ADD COLUMN IF NOT EXISTS "help_text" VARCHAR(500);
ALTER TABLE "event_form_fields" ADD COLUMN IF NOT EXISTS "config" JSONB;
ALTER TABLE "event_form_fields" ADD COLUMN IF NOT EXISTS "show_if" JSONB;

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "form_uploads_purged_at" TIMESTAMPTZ(6);
