-- SiteBolt: Organisation module
-- Run in Supabase SQL Editor after previous migrations

CREATE TABLE IF NOT EXISTS company_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text,
  abn text,
  address text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO company_profile (company_name, abn, address)
SELECT 'SiteBolt Construction Pty Ltd', '', ''
WHERE NOT EXISTS (SELECT 1 FROM company_profile LIMIT 1);

CREATE TABLE IF NOT EXISTS company_insurances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurance_type text NOT NULL,
  policy_number text,
  expiry_date date,
  document_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS project_admins text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS assigned_workers text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS security_role text DEFAULT 'general_worker';

ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_security_role_check;
ALTER TABLE workers ADD CONSTRAINT workers_security_role_check
  CHECK (
    security_role IS NULL OR security_role IN (
      'full_access',
      'admin_access',
      'general_worker'
    )
  );

ALTER TABLE company_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_insurances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read company_profile" ON company_profile;
CREATE POLICY "Allow public read company_profile"
  ON company_profile FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public update company_profile" ON company_profile;
CREATE POLICY "Allow public update company_profile"
  ON company_profile FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public insert company_profile" ON company_profile;
CREATE POLICY "Allow public insert company_profile"
  ON company_profile FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read company_insurances" ON company_insurances;
CREATE POLICY "Allow public read company_insurances"
  ON company_insurances FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert company_insurances" ON company_insurances;
CREATE POLICY "Allow public insert company_insurances"
  ON company_insurances FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update company_insurances" ON company_insurances;
CREATE POLICY "Allow public update company_insurances"
  ON company_insurances FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public insert projects" ON projects;
CREATE POLICY "Allow public insert projects"
  ON projects FOR INSERT WITH CHECK (true);

-- Default linked admin profile to full access when name matches demo user
UPDATE workers
SET security_role = 'full_access'
WHERE security_role = 'general_worker'
  AND full_name ILIKE '%miller%';
