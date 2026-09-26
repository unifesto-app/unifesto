-- UNIFESTO_LIVE sessions (in-app, hosted via LiveKit).
-- The join credential is a per-user token, not a URL, so meeting_url is no
-- longer required. The LiveKit room name is derived from the session id, so
-- nothing extra is stored.

-- 1. New platform value. (ADD VALUE is safe inside Prisma's migration tx here
--    because this migration does not itself use the new value.)
ALTER TYPE "session_platform" ADD VALUE IF NOT EXISTS 'UNIFESTO_LIVE';

-- 2. External sessions still carry a meeting_url; live sessions do not.
ALTER TABLE "sessions" ALTER COLUMN "meeting_url" DROP NOT NULL;
