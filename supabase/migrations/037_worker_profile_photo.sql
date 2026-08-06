-- Worker profile photo for dashboard avatar
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS photo_url text;

COMMENT ON COLUMN workers.photo_url IS 'Public URL for worker profile photo in worker-images bucket';

INSERT INTO storage.buckets (id, name, public)
VALUES ('worker-images', 'worker-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read worker images" ON storage.objects;
CREATE POLICY "Public read worker images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'worker-images');

DROP POLICY IF EXISTS "Public upload worker images" ON storage.objects;
CREATE POLICY "Public upload worker images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'worker-images');

DROP POLICY IF EXISTS "Public update worker images" ON storage.objects;
CREATE POLICY "Public update worker images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'worker-images');
