-- A lead or curator can retire an unfilled group seat. RELEASED seats keep the
-- group's paid capacity but stop showing on the manage screen and can't be
-- invited/claimed. Reversible back to OPEN.
ALTER TYPE "group_seat_status" ADD VALUE IF NOT EXISTS 'RELEASED';
