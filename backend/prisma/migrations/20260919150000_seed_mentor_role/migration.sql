-- Seed the event-scoped MENTOR role for the competitive dashboard.
--
-- Split from 20260919140000 (which ADDs the 'MENTOR' enum value) because
-- Postgres forbids USING a newly-added enum value in the same transaction that
-- added it. Same pattern as the JUDGE add/seed pair. Idempotent via ON CONFLICT.
INSERT INTO "roles" ("code", "name", "scope")
VALUES ('MENTOR', 'Mentor', 'EVENT')
ON CONFLICT ("code") DO NOTHING;
