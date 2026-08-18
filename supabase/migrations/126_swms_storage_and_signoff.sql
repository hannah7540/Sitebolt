-- SWMS document storage bucket, signatures bucket, and sign-off metadata
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('swms-documents', 'swms-documents', true),
  ('signatures', 'signatures', true)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  bucket_name text;
BEGIN
  FOREACH bucket_name IN ARRAY ARRAY['swms-documents', 'signatures']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow public read %1$s" ON storage.objects', bucket_name);
    EXECUTE format(
      'CREATE POLICY "Allow public read %1$s" ON storage.objects FOR SELECT USING (bucket_id = %2$L)',
      bucket_name,
      bucket_name
    );

    EXECUTE format('DROP POLICY IF EXISTS "Allow public insert %1$s" ON storage.objects', bucket_name);
    EXECUTE format(
      'CREATE POLICY "Allow public insert %1$s" ON storage.objects FOR INSERT WITH CHECK (bucket_id = %2$L)',
      bucket_name,
      bucket_name
    );

    EXECUTE format('DROP POLICY IF EXISTS "Allow public update %1$s" ON storage.objects', bucket_name);
    EXECUTE format(
      'CREATE POLICY "Allow public update %1$s" ON storage.objects FOR UPDATE USING (bucket_id = %2$L)',
      bucket_name,
      bucket_name
    );
  END LOOP;
END $$;

ALTER TABLE swms_documents
  ADD COLUMN IF NOT EXISTS document_url text,
  ADD COLUMN IF NOT EXISTS file_name text;

ALTER TABLE swms
  ADD COLUMN IF NOT EXISTS document_url text,
  ADD COLUMN IF NOT EXISTS file_name text;

ALTER TABLE swms_assignments
  ADD COLUMN IF NOT EXISTS acknowledged_risks boolean DEFAULT false;

UPDATE swms_documents
SET document_url = COALESCE(document_url, file_url, doc_url)
WHERE document_url IS NULL;

UPDATE swms
SET document_url = COALESCE(document_url, file_url, doc_url)
WHERE document_url IS NULL;
