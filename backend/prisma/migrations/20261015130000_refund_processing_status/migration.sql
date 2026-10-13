-- S11: a refund being settled is claimed PENDING_ADMIN -> PROCESSING before
-- Razorpay is called, so two admins (or a double click) can't refund twice.
-- Its own migration: Postgres won't let a new enum value be used in the same
-- transaction that adds it (the partial index in the next migration uses it).
ALTER TYPE "refund_status" ADD VALUE IF NOT EXISTS 'PROCESSING';
