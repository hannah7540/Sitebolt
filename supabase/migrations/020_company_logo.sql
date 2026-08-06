-- Company logo branding on organisation profile
ALTER TABLE company_profile
  ADD COLUMN IF NOT EXISTS logo_url text;

COMMENT ON COLUMN company_profile.logo_url IS 'Public URL for company logo in company-assets bucket';

INSERT INTO storage.buckets (id, name, public)
VALUES ('company-assets', 'company-assets', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read company assets" ON storage.objects;
CREATE POLICY "Public read company assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company-assets');

DROP POLICY IF EXISTS "Public upload company assets" ON storage.objects;
CREATE POLICY "Public upload company assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'company-assets');

DROP POLICY IF EXISTS "Public update company assets" ON storage.objects;
CREATE POLICY "Public update company assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'company-assets');
