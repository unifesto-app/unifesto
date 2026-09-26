CREATE TABLE space_status_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id),
  current_status VARCHAR(20) NOT NULL,
  requested_status VARCHAR(20) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  review_note TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_space_status_requests_space_id ON space_status_requests(space_id);
CREATE INDEX idx_space_status_requests_requested_by ON space_status_requests(requested_by);
CREATE INDEX idx_space_status_requests_status ON space_status_requests(status);
