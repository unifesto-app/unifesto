-- A25: a refund Razorpay accepted and later failed is still owed.
ALTER TYPE "refund_status" ADD VALUE IF NOT EXISTS 'REFUND_FAILED';
