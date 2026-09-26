-- Per-certificate delivery timestamp.
--
-- Records when a recipient was last emailed a link to their certificate. NULL
-- means never delivered (no email on file, or a send that failed), so this
-- column doubles as the "needs a resend" signal. Nullable with no default:
-- every certificate that predates this migration is correctly treated as
-- not-yet-emailed.

ALTER TABLE "certificates" ADD COLUMN "emailed_at" TIMESTAMPTZ(6);
