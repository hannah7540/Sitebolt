-- Plant profile: photo, employment fields, and documentation JSONB
ALTER TABLE plant
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS registration_code text,
  ADD COLUMN IF NOT EXISTS hourly_cost_rate numeric(10, 2),
  ADD COLUMN IF NOT EXISTS ownership_type text,
  ADD COLUMN IF NOT EXISTS plant_documents jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE plant_equipment
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS registration_code text,
  ADD COLUMN IF NOT EXISTS hourly_cost_rate numeric(10, 2),
  ADD COLUMN IF NOT EXISTS plant_documents jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN plant.plant_documents IS 'Structured plant docs: service, risk/safety, registration/insurance';
COMMENT ON COLUMN plant.photo_url IS 'Plant thumbnail in plant-images bucket';

INSERT INTO storage.buckets (id, name, public)
VALUES ('plant-images', 'plant-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read plant images" ON storage.objects;
CREATE POLICY "Public read plant images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'plant-images');

DROP POLICY IF EXISTS "Public upload plant images" ON storage.objects;
CREATE POLICY "Public upload plant images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'plant-images');
