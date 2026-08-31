-- Certificate URLs and public storage for lasers / pressure gauges

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS service_cert_url text,
  ADD COLUMN IF NOT EXISTS calibration_cert_url text,
  ADD COLUMN IF NOT EXISTS ref_number text,
  ADD COLUMN IF NOT EXISTS next_service_date date,
  ADD COLUMN IF NOT EXISTS next_calibration_date date;

COMMENT ON COLUMN assets.service_cert_url IS
  'Public URL for the laser service certificate in the asset-documents bucket.';
COMMENT ON COLUMN assets.calibration_cert_url IS
  'Public URL for the laser/gauge calibration certificate in the asset-documents bucket.';
COMMENT ON COLUMN assets.ref_number IS
  'Category reference number alias for lasers and pressure gauges.';
COMMENT ON COLUMN assets.next_service_date IS
  'Alias of next_service_due_date used by laser forms.';
COMMENT ON COLUMN assets.next_calibration_date IS
  'Alias of next_calibration_due_date used by laser and pressure gauge forms.';

INSERT INTO storage.buckets (id, name, public)
VALUES ('asset-documents', 'asset-documents', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Public read asset-documents" ON storage.objects;
CREATE POLICY "Public read asset-documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'asset-documents');

DROP POLICY IF EXISTS "Public upload asset-documents" ON storage.objects;
CREATE POLICY "Public upload asset-documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'asset-documents');

DROP POLICY IF EXISTS "Public update asset-documents" ON storage.objects;
CREATE POLICY "Public update asset-documents"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'asset-documents');
