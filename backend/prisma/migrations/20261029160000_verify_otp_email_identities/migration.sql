-- A28: seat claims and the "you've been invited" list now trust only verified
-- emails. An email-provider identity on an account whose mobile is verified was
-- proven by email OTP (the only way into it), even when it was first made for
-- someone by an attendee import and never flipped to verified. Data only.
UPDATE user_identities ui
SET email_verified = true
FROM users u
WHERE u.id = ui.user_id
  AND ui.provider = 'EMAIL'
  AND ui.email IS NOT NULL
  AND ui.email_verified IS NOT TRUE
  AND u.mobile_verified = true;
