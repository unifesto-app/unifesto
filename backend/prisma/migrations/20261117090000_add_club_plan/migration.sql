-- New Club plan between General (STARTER) and Growth. Its own migration: a
-- new enum value can't be used in the transaction that adds it.
ALTER TYPE "org_plan" ADD VALUE IF NOT EXISTS 'CLUB' BEFORE 'GROWTH';
