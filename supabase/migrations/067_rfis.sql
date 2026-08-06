-- SiteBolt: Request for Information (RFI) register

CREATE SEQUENCE IF NOT EXISTS rfis_number_seq START 1;

CREATE TABLE IF NOT EXISTS rfis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfi_number text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  project_id text,
  project_name text,
  status text NOT NULL DEFAULT 'Outstanding'
    CHECK (status IN ('Outstanding', 'Assigned', 'Completed')),
  requested_by_id uuid NOT NULL,
  requested_by_name text NOT NULL,
  request_signature_url text,
  assigned_to_id uuid,
  assigned_to_name text,
  assigned_at timestamptz,
  action_response text,
  action_signature_url text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rfis_status ON rfis(status);
CREATE INDEX IF NOT EXISTS idx_rfis_project ON rfis(project_id);
CREATE INDEX IF NOT EXISTS idx_rfis_requested_by ON rfis(requested_by_id);
CREATE INDEX IF NOT EXISTS idx_rfis_assigned_to ON rfis(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_rfis_created_at ON rfis(created_at DESC);

ALTER TABLE rfis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read rfis" ON rfis;
CREATE POLICY "Allow public read rfis"
  ON rfis FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public write rfis" ON rfis;
CREATE POLICY "Allow public write rfis"
  ON rfis FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE rfis IS 'Worker-submitted RFIs with assignment and completion workflow';
