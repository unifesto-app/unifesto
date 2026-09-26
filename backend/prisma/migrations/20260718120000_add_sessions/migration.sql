-- Sessions: lightweight, online-only gatherings owned by a Space (Meet/Zoom/Teams).
-- Separate from events — no tickets, QR, forms, or groups. A session has a title,
-- a time, a gated meeting link, and an optional single price. Razorpay-only in v1
-- (no wallet coins); organiser cancellation auto-refunds paid attendees.

-- Enums
CREATE TYPE session_platform AS ENUM ('GOOGLE_MEET', 'ZOOM', 'MS_TEAMS', 'OTHER');
CREATE TYPE session_status AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED');
CREATE TYPE session_visibility AS ENUM ('PUBLIC', 'UNLISTED');

-- Sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(200) NOT NULL UNIQUE,
  description TEXT,
  cover_image_url TEXT,
  platform session_platform NOT NULL DEFAULT 'GOOGLE_MEET',
  meeting_url TEXT NOT NULL,
  platform_other VARCHAR(100),
  start_date_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  timezone VARCHAR(100) NOT NULL DEFAULT 'Asia/Kolkata',
  capacity INTEGER,
  registered_count INTEGER NOT NULL DEFAULT 0,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  status session_status NOT NULL DEFAULT 'DRAFT',
  visibility session_visibility NOT NULL DEFAULT 'PUBLIC',
  recording_url TEXT,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sessions_space_id_idx ON sessions(space_id);
CREATE INDEX sessions_slug_idx ON sessions(slug);
CREATE INDEX sessions_status_idx ON sessions(status);
CREATE INDEX sessions_start_date_time_idx ON sessions(start_date_time);
CREATE INDEX sessions_created_by_idx ON sessions(created_by);

-- Session registrations. Money columns mirror event_registrations minus coins.
CREATE TABLE session_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  razorpay_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  processing_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
  refunded_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  payment_status payment_status NOT NULL DEFAULT 'PENDING',
  payment_id VARCHAR(255),
  order_id VARCHAR(255),
  paid_at TIMESTAMPTZ,
  status registration_status NOT NULL DEFAULT 'REGISTERED',
  joined_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  UNIQUE (session_id, user_id)
);

CREATE INDEX session_registrations_session_id_idx ON session_registrations(session_id);
CREATE INDEX session_registrations_user_id_idx ON session_registrations(user_id);
CREATE INDEX session_registrations_payment_status_idx ON session_registrations(payment_status);
