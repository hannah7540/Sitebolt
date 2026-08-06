-- Admin generated reports audit log and re-download store

CREATE TABLE IF NOT EXISTS generated_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actioned_by_id text,
  actioned_by_name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  selected_modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  project_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  project_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  file_name text NOT NULL,
  csv_content text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_generated_reports_created_at
  ON generated_reports(created_at DESC);

ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read generated_reports" ON generated_reports;
CREATE POLICY "Allow public read generated_reports"
  ON generated_reports FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert generated_reports" ON generated_reports;
CREATE POLICY "Allow public insert generated_reports"
  ON generated_reports FOR INSERT WITH CHECK (true);

COMMENT ON TABLE generated_reports IS 'Audit log for Administration Reporting exports with stored CSV payload for re-download';
