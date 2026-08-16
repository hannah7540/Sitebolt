-- Dedicated ITP/ITC storage buckets (attachments + signatures)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('itp-attachments', 'itp-attachments', true),
  ('itc-attachments', 'itc-attachments', true),
  ('itp-signatures', 'itp-signatures', true)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  bucket_name text;
BEGIN
  FOREACH bucket_name IN ARRAY ARRAY['itp-attachments', 'itc-attachments', 'itp-signatures']
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
