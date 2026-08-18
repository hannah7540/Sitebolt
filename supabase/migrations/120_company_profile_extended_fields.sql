-- Extended organisation / company profile fields for SiteBolt settings

ALTER TABLE company_profile
  ADD COLUMN IF NOT EXISTS trading_name text,
  ADD COLUMN IF NOT EXISTS acn text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS suburb text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS postcode text;

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS trading_name text,
  ADD COLUMN IF NOT EXISTS acn text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS suburb text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS postcode text;

-- Ensure a canonical singleton row exists for resilient upserts
INSERT INTO company_profile (id, company_name, abn, address)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  'SiteBolt Construction Pty Ltd',
  '',
  ''
WHERE NOT EXISTS (SELECT 1 FROM company_profile LIMIT 1);

INSERT INTO organisations (id, company_name, abn, address)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  'SiteBolt Construction Pty Ltd',
  '',
  ''
WHERE NOT EXISTS (SELECT 1 FROM organisations LIMIT 1);
