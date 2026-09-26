-- KonfHub parity P1: additional white-label surfaces (space-level).
--
-- Favicon on public pages + a custom confirmation-email sender identity
-- (display name + reply-to; the sending ADDRESS and domain are unchanged).
-- All three take effect only while the space's white-label is enabled AND the
-- plan carries `has_remove_branding` — the same two-check gate as the existing
-- brand logo/colour, enforced in the render path (resolveSpaceSurfaces).

ALTER TABLE "spaces"
  ADD COLUMN "favicon_url" TEXT,
  ADD COLUMN "email_from_name" VARCHAR(100),
  ADD COLUMN "email_reply_to" VARCHAR(255);
