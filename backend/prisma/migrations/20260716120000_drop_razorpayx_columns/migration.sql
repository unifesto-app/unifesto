-- RazorpayX (payout transfers) was removed; these columns are no longer written
-- or read. Drop them. Payout settlement now records a manual `utr` only.

ALTER TABLE organiser_bank_accounts
  DROP COLUMN IF EXISTS razorpay_contact_id,
  DROP COLUMN IF EXISTS razorpay_fund_account_id;

ALTER TABLE payouts
  DROP COLUMN IF EXISTS razorpay_transfer_id,
  DROP COLUMN IF EXISTS razorpay_payout_id;
