-- API request log for admin observability

CREATE TABLE api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  method VARCHAR(10) NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  user_id UUID,
  ip_address VARCHAR(64),
  user_agent TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX api_logs_created_at_idx ON api_logs(created_at);
CREATE INDEX api_logs_status_code_idx ON api_logs(status_code);
CREATE INDEX api_logs_method_idx ON api_logs(method);
CREATE INDEX api_logs_user_id_idx ON api_logs(user_id);
