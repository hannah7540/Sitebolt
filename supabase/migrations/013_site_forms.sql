-- SiteBolt: Site safety forms (pre-start, toolbox talk, safety walk)
-- Run in Supabase SQL Editor after previous migrations

CREATE TABLE IF NOT EXISTS site_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_type text NOT NULL
    CHECK (form_type IN ('daily_prestart', 'toolbox_talk', 'safety_walk')),
  project_id text NOT NULL,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  form_date date NOT NULL,
  form_time time,
  location_scope text,
  checklist_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitter_signature_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_forms_project_id ON site_forms(project_id);
CREATE INDEX IF NOT EXISTS idx_site_forms_form_type ON site_forms(form_type);
CREATE INDEX IF NOT EXISTS idx_site_forms_submitted_at ON site_forms(submitted_at DESC);

ALTER TABLE site_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read site_forms" ON site_forms;
CREATE POLICY "Allow public read site_forms"
  ON site_forms FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert site_forms" ON site_forms;
CREATE POLICY "Allow public insert site_forms"
  ON site_forms FOR INSERT WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('site-form-uploads', 'site-form-uploads', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read site form uploads" ON storage.objects;
CREATE POLICY "Public read site form uploads"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'site-form-uploads');

DROP POLICY IF EXISTS "Public upload site form files" ON storage.objects;
CREATE POLICY "Public upload site form files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'site-form-uploads');
