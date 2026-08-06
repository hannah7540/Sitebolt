-- SWMS documents and per-assignee signing workflow
CREATE TABLE IF NOT EXISTS swms_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  document_date date NOT NULL,
  file_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS swms_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swms_id uuid NOT NULL REFERENCES swms_documents(id) ON DELETE CASCADE,
  assignee_type text NOT NULL CHECK (assignee_type IN ('worker', 'subcontractor')),
  assignee_id uuid NOT NULL,
  assignee_name text NOT NULL,
  signing_token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Signed')),
  signature_url text,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swms_assignments_swms_id ON swms_assignments(swms_id);
CREATE INDEX IF NOT EXISTS idx_swms_assignments_token ON swms_assignments(signing_token);
CREATE INDEX IF NOT EXISTS idx_swms_assignments_assignee ON swms_assignments(assignee_type, assignee_id);

ALTER TABLE swms_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE swms_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read swms_documents" ON swms_documents;
CREATE POLICY "Allow public read swms_documents"
  ON swms_documents FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert swms_documents" ON swms_documents;
CREATE POLICY "Allow public insert swms_documents"
  ON swms_documents FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update swms_documents" ON swms_documents;
CREATE POLICY "Allow public update swms_documents"
  ON swms_documents FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public read swms_assignments" ON swms_assignments;
CREATE POLICY "Allow public read swms_assignments"
  ON swms_assignments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert swms_assignments" ON swms_assignments;
CREATE POLICY "Allow public insert swms_assignments"
  ON swms_assignments FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update swms_assignments" ON swms_assignments;
CREATE POLICY "Allow public update swms_assignments"
  ON swms_assignments FOR UPDATE USING (true);
