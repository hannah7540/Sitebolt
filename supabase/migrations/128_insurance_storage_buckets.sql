-- Public storage buckets for insurance policy documents

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('insurances', 'insurances', true),
  ('documents', 'documents', true),
  ('organisation-insurances', 'organisation-insurances', true),
  ('company-insurances', 'company-insurances', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Public read insurances bucket" ON storage.objects;
CREATE POLICY "Public read insurances bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id IN ('insurances', 'documents', 'organisation-insurances', 'company-insurances'));

DROP POLICY IF EXISTS "Public upload insurances bucket" ON storage.objects;
CREATE POLICY "Public upload insurances bucket"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id IN ('insurances', 'documents', 'organisation-insurances', 'company-insurances'));

DROP POLICY IF EXISTS "Public update insurances bucket" ON storage.objects;
CREATE POLICY "Public update insurances bucket"
  ON storage.objects FOR UPDATE
  USING (bucket_id IN ('insurances', 'documents', 'organisation-insurances', 'company-insurances'));
