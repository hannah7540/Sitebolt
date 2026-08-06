-- Fallback organisations table for company branding and profile details
CREATE TABLE IF NOT EXISTS organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text,
  abn text,
  address text,
  logo_url text,
  company_logo text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_profile
  ADD COLUMN IF NOT EXISTS company_logo text;

COMMENT ON COLUMN company_profile.company_logo IS 'Legacy alias for logo_url';
COMMENT ON COLUMN organisations.company_logo IS 'Legacy alias for logo_url';

INSERT INTO organisations (company_name, abn, address)
SELECT 'SiteBolt Construction Pty Ltd', '', ''
WHERE NOT EXISTS (SELECT 1 FROM organisations LIMIT 1);

ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read organisations" ON organisations;
CREATE POLICY "Allow public read organisations"
  ON organisations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public update organisations" ON organisations;
CREATE POLICY "Allow public update organisations"
  ON organisations FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public insert organisations" ON organisations;
CREATE POLICY "Allow public insert organisations"
  ON organisations FOR INSERT WITH CHECK (true);
