-- Status page: health-check history + incidents

CREATE TYPE incident_status AS ENUM ('INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED');
CREATE TYPE incident_impact AS ENUM ('NONE', 'MINOR', 'MAJOR', 'CRITICAL');

CREATE TABLE health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service VARCHAR(50) NOT NULL,
  up BOOLEAN NOT NULL,
  latency_ms INTEGER,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX health_checks_service_checked_at_idx ON health_checks(service, checked_at);

CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(300) NOT NULL,
  body TEXT,
  status incident_status NOT NULL DEFAULT 'INVESTIGATING',
  impact incident_impact NOT NULL DEFAULT 'MINOR',
  affected_services TEXT[] NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX incidents_started_at_idx ON incidents(started_at);
