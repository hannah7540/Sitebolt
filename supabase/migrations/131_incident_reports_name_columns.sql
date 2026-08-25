-- Ensure denormalized name + array columns exist on incident_reports
-- (fixes PGRST204 when PostgREST schema is missing name columns)

ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS project_name text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS injured_worker_name text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS treating_person_name text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS submitted_by_name text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS witness_names text[] DEFAULT '{}'::text[];
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS witness_ids uuid[] DEFAULT '{}'::uuid[];
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS medical_certificate_urls text[] DEFAULT '{}'::text[];
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS injury_details text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS offsite_treatment_location text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS treatment_given text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS what_caused_to_go_wrong text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS what_could_have_prevented text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS recommendations_to_prevent text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS submitter_signature_url text;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS is_read_admin boolean DEFAULT false;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS status text DEFAULT 'new';

UPDATE incident_reports SET witness_names = '{}'::text[] WHERE witness_names IS NULL;
UPDATE incident_reports SET witness_ids = '{}'::uuid[] WHERE witness_ids IS NULL;
UPDATE incident_reports SET medical_certificate_urls = '{}'::text[] WHERE medical_certificate_urls IS NULL;
UPDATE incident_reports SET is_read_admin = false WHERE is_read_admin IS NULL;
UPDATE incident_reports SET status = 'new' WHERE status IS NULL OR btrim(status) = '';

NOTIFY pgrst, 'reload schema';
