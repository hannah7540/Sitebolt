-- 1-Click Document Pack export audit log

CREATE TABLE IF NOT EXISTS document_pack_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  project_name text,
  date_from date NOT NULL,
  date_to date NOT NULL,
  included_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  file_name text NOT NULL,
  exported_at timestamptz NOT NULL DEFAULT now(),
  exported_by text
);

CREATE INDEX IF NOT EXISTS idx_document_pack_exports_project_id
  ON document_pack_exports(project_id);
CREATE INDEX IF NOT EXISTS idx_document_pack_exports_exported_at
  ON document_pack_exports(exported_at DESC);

ALTER TABLE document_pack_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read document_pack_exports" ON document_pack_exports;
CREATE POLICY "Allow public read document_pack_exports"
  ON document_pack_exports FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert document_pack_exports" ON document_pack_exports;
CREATE POLICY "Allow public insert document_pack_exports"
  ON document_pack_exports FOR INSERT WITH CHECK (true);

COMMENT ON TABLE document_pack_exports IS 'Audit log for Administration 1-Click Document Pack PDF exports';
