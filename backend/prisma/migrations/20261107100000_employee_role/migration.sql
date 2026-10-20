-- Track U1: platform-scoped EMPLOYEE role (Company section + Product board in
-- Apex). The `roles` row and its default capabilities are seeded in the
-- follow-up migration, because Postgres forbids using a new enum value in the
-- transaction that added it (same add/seed split as JUDGE and MENTOR).
ALTER TYPE "role_code" ADD VALUE IF NOT EXISTS 'EMPLOYEE';
