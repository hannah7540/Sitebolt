-- Heavy vehicle completed/due dates, registration expiry, and registration document.

ALTER TABLE plant
  ADD COLUMN IF NOT EXISTS heavy_vehicle_last_completed_date date,
  ADD COLUMN IF NOT EXISTS heavy_vehicle_next_due_date date,
  ADD COLUMN IF NOT EXISTS registration_expiry_date date,
  ADD COLUMN IF NOT EXISTS registration_document_url text;

UPDATE plant
SET heavy_vehicle_last_completed_date = last_heavy_vehicle_check_date
WHERE heavy_vehicle_last_completed_date IS NULL
  AND last_heavy_vehicle_check_date IS NOT NULL;

UPDATE plant
SET heavy_vehicle_next_due_date = next_heavy_vehicle_check_due_date
WHERE heavy_vehicle_next_due_date IS NULL
  AND next_heavy_vehicle_check_due_date IS NOT NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('plant-documents', 'plant-documents', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read plant documents" ON storage.objects;
CREATE POLICY "Public read plant documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'plant-documents');

DROP POLICY IF EXISTS "Public upload plant documents" ON storage.objects;
CREATE POLICY "Public upload plant documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'plant-documents');

DROP POLICY IF EXISTS "Public update plant documents" ON storage.objects;
CREATE POLICY "Public update plant documents"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'plant-documents')
  WITH CHECK (bucket_id = 'plant-documents');

NOTIFY pgrst, 'reload schema';
