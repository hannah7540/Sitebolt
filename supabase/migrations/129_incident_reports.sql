-- Incident reports: worker submissions + admin register

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
  treatment_details text NOT NULL DEFAULT 'None'
    CHECK (treatment_details IN ('None', 'First Aid', 'Doctor or Clinic', 'Hospital')),
  treating_person_id uuid,
  treating_person_name text,
  offsite_treatment_location text,
  what_occurred text NOT NULL DEFAULT '',
  incident_location_details text NOT NULL DEFAULT '',
  treatment_given text,
  witness_ids uuid[] NOT NULL DEFAULT '{}',
  witness_names text[] NOT NULL DEFAULT '{}',
  immediate_corrective_action_required boolean NOT NULL DEFAULT false,
  is_notifiable_under_whs boolean NOT NULL DEFAULT false,
  what_caused_to_go_wrong text,
  what_could_have_prevented text,
  recommendations_to_prevent text,
  medical_certificate_urls text[] NOT NULL DEFAULT '{}',
  submitter_signature_url text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'under_investigation', 'closed')),
  is_read_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_reports_status ON incident_reports(status);
CREATE INDEX IF NOT EXISTS idx_incident_reports_project ON incident_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_incident_reports_submitted_by ON incident_reports(submitted_by_id);
CREATE INDEX IF NOT EXISTS idx_incident_reports_created_at ON incident_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_reports_unread
  ON incident_reports(is_read_admin, status)
  WHERE is_read_admin = false OR status = 'new';

ALTER TABLE incident_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read incident_reports" ON incident_reports;
CREATE POLICY "Allow public read incident_reports"
  ON incident_reports FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public write incident_reports" ON incident_reports;
CREATE POLICY "Allow public write incident_reports"
  ON incident_reports FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE incident_reports IS 'Worker-submitted workplace incident reports with root cause analysis';

-- Storage bucket for medical certificates and signatures
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
