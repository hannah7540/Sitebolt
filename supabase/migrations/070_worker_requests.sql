-- SiteBolt: Worker uniform / tools / equipment requests

CREATE SEQUENCE IF NOT EXISTS worker_requests_number_seq START 1;

CREATE TABLE IF NOT EXISTS worker_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text NOT NULL UNIQUE,
  worker_id uuid NOT NULL,
  worker_name text NOT NULL,
  project_id text,
  project_name text,
  request_type text NOT NULL
    CHECK (request_type IN ('Uniform', 'Tools', 'Job Specific Equipment')),
  uniform_item text,
  uniform_size text,
  quantity integer NOT NULL DEFAULT 1,
  description text,
  status text NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'In Progress', 'Fulfilled')),
  admin_comments text,
  fulfilled_at timestamptz,
  fulfilled_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_requests_status ON worker_requests(status);
CREATE INDEX IF NOT EXISTS idx_worker_requests_project ON worker_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_worker_requests_worker ON worker_requests(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_requests_created_at ON worker_requests(created_at DESC);

ALTER TABLE worker_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read worker_requests" ON worker_requests;
CREATE POLICY "Allow public read worker_requests"
  ON worker_requests FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public write worker_requests" ON worker_requests;
CREATE POLICY "Allow public write worker_requests"
  ON worker_requests FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE worker_requests IS 'Worker-submitted uniform, tools, and equipment requests';
