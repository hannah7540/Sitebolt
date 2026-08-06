-- SiteBolt: Subcontractor management
-- Run in Supabase SQL Editor after 014_site_forms_form_data.sql

CREATE TABLE IF NOT EXISTS subcontractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  abn text,
  contact_name text,
  contact_email text,
  contact_phone text,
  address text,
  trade_type text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'suspended')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subcontractor_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id uuid NOT NULL REFERENCES subcontractors(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  title text,
  expiry_date date,
  document_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subcontractor_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id uuid NOT NULL REFERENCES subcontractors(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  email text,
  white_card_number text,
  white_card_expiry date,
  licence_expiry date,
  assigned_project_ids text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subcontractor_plant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id uuid NOT NULL REFERENCES subcontractors(id) ON DELETE CASCADE,
  unit_number text NOT NULL,
  category text,
  make text,
  model text,
  registration_expiry date,
  service_expiry date,
  assigned_project_ids text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'available',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subcontractors_company ON subcontractors(company_name);
CREATE INDEX IF NOT EXISTS idx_subcontractor_documents_sub_id ON subcontractor_documents(subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_subcontractor_workers_sub_id ON subcontractor_workers(subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_subcontractor_plant_sub_id ON subcontractor_plant(subcontractor_id);

ALTER TABLE subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontractor_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontractor_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontractor_plant ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read subcontractors" ON subcontractors;
CREATE POLICY "Allow public read subcontractors"
  ON subcontractors FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert subcontractors" ON subcontractors;
CREATE POLICY "Allow public insert subcontractors"
  ON subcontractors FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update subcontractors" ON subcontractors;
CREATE POLICY "Allow public update subcontractors"
  ON subcontractors FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public read subcontractor_documents" ON subcontractor_documents;
CREATE POLICY "Allow public read subcontractor_documents"
  ON subcontractor_documents FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert subcontractor_documents" ON subcontractor_documents;
CREATE POLICY "Allow public insert subcontractor_documents"
  ON subcontractor_documents FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update subcontractor_documents" ON subcontractor_documents;
CREATE POLICY "Allow public update subcontractor_documents"
  ON subcontractor_documents FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public read subcontractor_workers" ON subcontractor_workers;
CREATE POLICY "Allow public read subcontractor_workers"
  ON subcontractor_workers FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert subcontractor_workers" ON subcontractor_workers;
CREATE POLICY "Allow public insert subcontractor_workers"
  ON subcontractor_workers FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update subcontractor_workers" ON subcontractor_workers;
CREATE POLICY "Allow public update subcontractor_workers"
  ON subcontractor_workers FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public read subcontractor_plant" ON subcontractor_plant;
CREATE POLICY "Allow public read subcontractor_plant"
  ON subcontractor_plant FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert subcontractor_plant" ON subcontractor_plant;
CREATE POLICY "Allow public insert subcontractor_plant"
  ON subcontractor_plant FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update subcontractor_plant" ON subcontractor_plant;
CREATE POLICY "Allow public update subcontractor_plant"
  ON subcontractor_plant FOR UPDATE USING (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('subcontractor-docs', 'subcontractor-docs', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read subcontractor docs" ON storage.objects;
CREATE POLICY "Public read subcontractor docs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'subcontractor-docs');

DROP POLICY IF EXISTS "Public upload subcontractor docs" ON storage.objects;
CREATE POLICY "Public upload subcontractor docs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'subcontractor-docs');
