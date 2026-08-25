-- Ensure Incident Reports table + storage bucket exist (idempotent schema fix)

CREATE SEQUENCE IF NOT EXISTS incident_reports_ref_seq START 1;

CREATE TABLE IF NOT EXISTS incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number text NOT NULL UNIQUE,
  submitted_by_id uuid,
  submitted_by_name text,
  incident_date_time timestamptz NOT NULL,
  project_id uuid,
  project_name text,
  injured_worker_id uuid,
  injured_worker_name text,
  injury_details text,
  treatment_details text NOT NULL DEFAULT 'None',
  treating_person_id uuid,
  treating_person_name text,
  offsite_treatment_location text,
  what_occurred text NOT NULL DEFAULT '',
  incident_location_details text NOT NULL DEFAULT '',
  treatment_given text,
  witness_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  witness_names text[] NOT NULL DEFAULT '{}'::text[],
  immediate_corrective_action_required boolean NOT NULL DEFAULT false,
  is_notifiable_under_whs boolean NOT NULL DEFAULT false,
  what_caused_to_go_wrong text,
  what_could_have_prevented text,
  recommendations_to_prevent text,
  medical_certificate_urls text[] NOT NULL DEFAULT '{}'::text[],
  submitter_signature_url text,
  status text NOT NULL DEFAULT 'new',
  is_read_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS reference_number text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS submitted_by_id uuid;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS submitted_by_name text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS incident_date_time timestamptz;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS project_id uuid;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS project_name text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS injured_worker_id uuid;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS injured_worker_name text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS injury_details text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS treatment_details text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS treating_person_id uuid;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS treating_person_name text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS offsite_treatment_location text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS what_occurred text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS incident_location_details text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS treatment_given text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS witness_ids uuid[];
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS witness_names text[];
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS immediate_corrective_action_required boolean;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS is_notifiable_under_whs boolean;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS what_caused_to_go_wrong text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS what_could_have_prevented text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS recommendations_to_prevent text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS medical_certificate_urls text[];
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS submitter_signature_url text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS is_read_admin boolean;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE incident_reports SET witness_ids = '{}'::uuid[] WHERE witness_ids IS NULL;
UPDATE incident_reports SET witness_names = '{}'::text[] WHERE witness_names IS NULL;
UPDATE incident_reports SET medical_certificate_urls = '{}'::text[] WHERE medical_certificate_urls IS NULL;
UPDATE incident_reports SET immediate_corrective_action_required = false WHERE immediate_corrective_action_required IS NULL;
UPDATE incident_reports SET is_notifiable_under_whs = false WHERE is_notifiable_under_whs IS NULL;
UPDATE incident_reports SET is_read_admin = false WHERE is_read_admin IS NULL;
UPDATE incident_reports SET status = 'new' WHERE status IS NULL OR btrim(status) = '';
UPDATE incident_reports SET treatment_details = 'None' WHERE treatment_details IS NULL OR btrim(treatment_details) = '';
UPDATE incident_reports SET what_occurred = '' WHERE what_occurred IS NULL;
UPDATE incident_reports SET incident_location_details = '' WHERE incident_location_details IS NULL;
UPDATE incident_reports SET created_at = now() WHERE created_at IS NULL;
UPDATE incident_reports SET updated_at = now() WHERE updated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS incident_reports_reference_number_uidx
  ON incident_reports (reference_number);
CREATE INDEX IF NOT EXISTS idx_incident_reports_status ON incident_reports(status);
CREATE INDEX IF NOT EXISTS idx_incident_reports_project ON incident_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_incident_reports_submitted_by ON incident_reports(submitted_by_id);
CREATE INDEX IF NOT EXISTS idx_incident_reports_created_at ON incident_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_reports_unread_admin
  ON incident_reports(is_read_admin)
  WHERE is_read_admin = false;

ALTER TABLE incident_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read incident_reports" ON incident_reports;
CREATE POLICY "Allow public read incident_reports"
  ON incident_reports FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public write incident_reports" ON incident_reports;
CREATE POLICY "Allow public write incident_reports"
  ON incident_reports FOR ALL USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('incident-attachments', 'incident-attachments', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Public read incident-attachments" ON storage.objects;
CREATE POLICY "Public read incident-attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'incident-attachments');

DROP POLICY IF EXISTS "Public upload incident-attachments" ON storage.objects;
CREATE POLICY "Public upload incident-attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'incident-attachments');

DROP POLICY IF EXISTS "Public update incident-attachments" ON storage.objects;
CREATE POLICY "Public update incident-attachments"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'incident-attachments');

DROP POLICY IF EXISTS "Public delete incident-attachments" ON storage.objects;
CREATE POLICY "Public delete incident-attachments"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'incident-attachments');
