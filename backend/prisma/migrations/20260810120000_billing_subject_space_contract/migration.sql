-- P2.2 CONTRACT — Spaces platform re-architecture.
-- Billing subject is the Space. Drop the legacy per-user column from
-- org_subscriptions now that every space carries its own space-keyed row.
--
-- ┌─ PRECONDITIONS (all must hold before this runs) ────────────────────────┐
-- │ 1. `npm run backfill:p2 -- --apply` has run on THIS database and its     │
-- │    verification printed:                                                 │
-- │       legacy per-user rows remaining:  <any N>   (these get deleted here)│
-- │       spaces with own subscription  == total spaces                     │
-- │       legacy-code UserRole rows left ==  0                               │
-- │ 2. The `userId`-free backend build (schema.prisma without the field —    │
-- │    see APPLY.md) is DEPLOYED and serving. A running build that still     │
-- │    maps user_id will `SELECT user_id` and error the instant it is        │
-- │    dropped, so deploy the new build FIRST, then run this.                │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- Dropping the column also drops its unique index
-- (org_subscriptions_user_id_key) and the user_id foreign key automatically.

-- Delete the now-orphaned legacy per-user rows (fanned out by the backfill).
DELETE FROM "org_subscriptions" WHERE "user_id" IS NOT NULL AND "space_id" IS NULL;

-- Drop the legacy billing-subject column.
ALTER TABLE "org_subscriptions" DROP COLUMN "user_id";
