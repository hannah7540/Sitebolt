-- Isolated ITC field-module storage bucket for Photo QA uploads.

INSERT INTO storage.buckets (id, name, public)
VALUES ('itc-photos', 'itc-photos', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "read itc photos" ON storage.objects;
CREATE POLICY "read itc photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'itc-photos');

DROP POLICY IF EXISTS "upload itc photos" ON storage.objects;
CREATE POLICY "upload itc photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'itc-photos');

DROP POLICY IF EXISTS "update itc photos" ON storage.objects;
CREATE POLICY "update itc photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'itc-photos');

DROP POLICY IF EXISTS "delete own itc photos" ON storage.objects;
CREATE POLICY "delete own itc photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'itc-photos');

NOTIFY pgrst, 'reload schema';
