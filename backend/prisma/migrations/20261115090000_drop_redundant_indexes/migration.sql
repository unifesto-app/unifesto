-- J3: drop indexes another index already covers. Each one only cost writes:
-- a single-column index duplicating a UNIQUE on the same column, or a
-- single-column index that is the leading column of a composite index.
-- IF EXISTS: a few were created by hand-written SQL in older migrations.

-- Same column already has a UNIQUE index (<table>_<col>_key).
DROP INDEX IF EXISTS "spaces_slug_idx";
DROP INDEX IF EXISTS "events_slug_idx";
DROP INDEX IF EXISTS "event_registrations_qr_code_idx";
DROP INDEX IF EXISTS "group_seats_invite_token_idx";
DROP INDEX IF EXISTS "sessions_slug_idx";
DROP INDEX IF EXISTS "certificates_verification_code_idx";
DROP INDEX IF EXISTS "blog_posts_slug_idx";

-- Leading column of a composite index.
DROP INDEX IF EXISTS "event_registrations_event_id_idx"; -- (event_id, updated_at)
DROP INDEX IF EXISTS "api_logs_status_code_idx";         -- (status_code, created_at)
DROP INDEX IF EXISTS "api_logs_user_id_idx";             -- (user_id, created_at)
DROP INDEX IF EXISTS "user_roles_user_id_idx";           -- unique (user_id, role_id, space_id, event_id)
