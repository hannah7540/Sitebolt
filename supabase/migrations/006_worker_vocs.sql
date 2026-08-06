-- SiteBolt: Multiple VOCs per worker
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS worker_vocs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  title text NOT NULL,
  issuing_org text,
  issue_date date,
  expiry_date date,
  document_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_vocs_worker_id ON worker_vocs(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_vocs_expiry ON worker_vocs(expiry_date);

ALTER TABLE worker_vocs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read worker_vocs" ON worker_vocs;
CREATE POLICY "Allow public read worker_vocs"
  ON worker_vocs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert worker_vocs" ON worker_vocs;
CREATE POLICY "Allow public insert worker_vocs"
  ON worker_vocs FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update worker_vocs" ON worker_vocs;
CREATE POLICY "Allow public update worker_vocs"
  ON worker_vocs FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete worker_vocs" ON worker_vocs;
CREATE POLICY "Allow public delete worker_vocs"
  ON worker_vocs FOR DELETE USING (true);
