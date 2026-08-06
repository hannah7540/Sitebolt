-- SiteBolt: Worker onboarding v2 — emergency contacts, document URLs, financial fields
-- Run in Supabase SQL Editor

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship text,
  ADD COLUMN IF NOT EXISTS white_card_photo_url text,
  ADD COLUMN IF NOT EXISTS silica_cert_issue_date date,
  ADD COLUMN IF NOT EXISTS silica_cert_photo_url text,
  ADD COLUMN IF NOT EXISTS drivers_licence_photo_url text,
  ADD COLUMN IF NOT EXISTS voc_title text,
  ADD COLUMN IF NOT EXISTS voc_issuing_org text,
  ADD COLUMN IF NOT EXISTS voc_document_url text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS super_usi text,
  ADD COLUMN IF NOT EXISTS redundancy_fund_name text,
  ADD COLUMN IF NOT EXISTS redundancy_member_number text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('worker-docs', 'worker-docs', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read worker docs" ON storage.objects;
CREATE POLICY "Public read worker docs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'worker-docs');

DROP POLICY IF EXISTS "Public upload worker docs" ON storage.objects;
CREATE POLICY "Public upload worker docs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'worker-docs');
