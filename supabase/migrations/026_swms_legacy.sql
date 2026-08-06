-- Legacy SWMS table fallback (parallel to swms_documents)
CREATE TABLE IF NOT EXISTS swms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  document_date date NOT NULL,
  file_url text,
  doc_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE swms
  ADD COLUMN IF NOT EXISTS file_url text;

ALTER TABLE swms
  ADD COLUMN IF NOT EXISTS doc_url text;

COMMENT ON COLUMN swms.doc_url IS 'Legacy alias for file_url';

ALTER TABLE swms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read swms" ON swms;
CREATE POLICY "Allow public read swms"
  ON swms FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert swms" ON swms;
CREATE POLICY "Allow public insert swms"
  ON swms FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update swms" ON swms;
CREATE POLICY "Allow public update swms"
  ON swms FOR UPDATE USING (true);
