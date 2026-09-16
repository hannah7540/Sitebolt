-- Dynamic custom form templates and multi-entity submissions.

CREATE TABLE IF NOT EXISTS custom_form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  applies_to_projects boolean NOT NULL DEFAULT false,
  applies_to_workers boolean NOT NULL DEFAULT false,
  applies_to_plant boolean NOT NULL DEFAULT false,
  applies_to_fleet boolean NOT NULL DEFAULT false,
  applies_to_assets boolean NOT NULL DEFAULT false,
  assignee_role text NOT NULL DEFAULT 'all',
  is_active boolean NOT NULL DEFAULT true,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS custom_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES custom_form_templates(id) ON DELETE SET NULL,
  template_title text NOT NULL,
  project_id text,
  plant_id text,
  worker_id text,
  fleet_id text,
  asset_id text,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_by_name text,
  submitted_by_id text,
  signature_url text,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_form_submissions_project
  ON custom_form_submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_custom_form_submissions_plant
  ON custom_form_submissions(plant_id);
CREATE INDEX IF NOT EXISTS idx_custom_form_submissions_worker
  ON custom_form_submissions(worker_id);
CREATE INDEX IF NOT EXISTS idx_custom_form_submissions_fleet
  ON custom_form_submissions(fleet_id);
CREATE INDEX IF NOT EXISTS idx_custom_form_submissions_asset
  ON custom_form_submissions(asset_id);
CREATE INDEX IF NOT EXISTS idx_custom_form_submissions_template
  ON custom_form_submissions(template_id);

ALTER TABLE custom_form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_form_submissions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON custom_form_templates TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON custom_form_submissions TO anon, authenticated;

DROP POLICY IF EXISTS "Authenticated read custom_form_templates" ON custom_form_templates;
CREATE POLICY "Authenticated read custom_form_templates"
  ON custom_form_templates FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated insert custom_form_templates" ON custom_form_templates;
CREATE POLICY "Authenticated insert custom_form_templates"
  ON custom_form_templates FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update custom_form_templates" ON custom_form_templates;
CREATE POLICY "Authenticated update custom_form_templates"
  ON custom_form_templates FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated delete custom_form_templates" ON custom_form_templates;
CREATE POLICY "Authenticated delete custom_form_templates"
  ON custom_form_templates FOR DELETE USING (true);

DROP POLICY IF EXISTS "Authenticated read custom_form_submissions" ON custom_form_submissions;
CREATE POLICY "Authenticated read custom_form_submissions"
  ON custom_form_submissions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated insert custom_form_submissions" ON custom_form_submissions;
CREATE POLICY "Authenticated insert custom_form_submissions"
  ON custom_form_submissions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update custom_form_submissions" ON custom_form_submissions;
CREATE POLICY "Authenticated update custom_form_submissions"
  ON custom_form_submissions FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated delete custom_form_submissions" ON custom_form_submissions;
CREATE POLICY "Authenticated delete custom_form_submissions"
  ON custom_form_submissions FOR DELETE USING (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('form-attachments', 'form-attachments', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Public read form-attachments bucket" ON storage.objects;
CREATE POLICY "Public read form-attachments bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'form-attachments');

DROP POLICY IF EXISTS "Authenticated upload form-attachments bucket" ON storage.objects;
CREATE POLICY "Authenticated upload form-attachments bucket"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'form-attachments');

DROP POLICY IF EXISTS "Authenticated update form-attachments bucket" ON storage.objects;
CREATE POLICY "Authenticated update form-attachments bucket"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'form-attachments');

DROP POLICY IF EXISTS "Authenticated delete form-attachments bucket" ON storage.objects;
CREATE POLICY "Authenticated delete form-attachments bucket"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'form-attachments');

NOTIFY pgrst, 'reload schema';
