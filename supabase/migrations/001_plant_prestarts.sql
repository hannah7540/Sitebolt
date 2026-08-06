-- SiteBolt: Plant Pre-Start System schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query)

-- Pre-start template enum
DO $$ BEGIN
  CREATE TYPE prestart_template AS ENUM (
    'excavator', 'loader', 'roller', 'truck', 'hydrovac'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Extend plant table
ALTER TABLE plant
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS prestart_template prestart_template DEFAULT 'excavator',
  ADD COLUMN IF NOT EXISTS current_hours numeric,
  ADD COLUMN IF NOT EXISTS current_kms numeric,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'available';

-- Plant pre-starts log
CREATE TABLE IF NOT EXISTS plant_prestarts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id uuid NOT NULL REFERENCES plant(id) ON DELETE CASCADE,
  operator_name text NOT NULL,
  project_id text,
  current_reading numeric,
  next_service_due numeric,
  check_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  has_defect boolean NOT NULL DEFAULT false,
  defect_comments text,
  defect_photo_url text,
  signature_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plant_prestarts_plant_id ON plant_prestarts(plant_id);
CREATE INDEX IF NOT EXISTS idx_plant_prestarts_created_at ON plant_prestarts(created_at DESC);

-- Storage bucket for defect photos & signatures
INSERT INTO storage.buckets (id, name, public)
VALUES ('prestart-uploads', 'prestart-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: enable on plant_prestarts
ALTER TABLE plant_prestarts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read plant_prestarts" ON plant_prestarts;
CREATE POLICY "Allow public read plant_prestarts"
  ON plant_prestarts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert plant_prestarts" ON plant_prestarts;
CREATE POLICY "Allow public insert plant_prestarts"
  ON plant_prestarts FOR INSERT WITH CHECK (true);

-- Allow anon/authenticated to read & update plant (pre-start flow)
DROP POLICY IF EXISTS "Allow public read plant" ON plant;
CREATE POLICY "Allow public read plant"
  ON plant FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public update plant" ON plant;
CREATE POLICY "Allow public update plant"
  ON plant FOR UPDATE USING (true);

-- Storage policies
DROP POLICY IF EXISTS "Public read prestart uploads" ON storage.objects;
CREATE POLICY "Public read prestart uploads"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'prestart-uploads');

DROP POLICY IF EXISTS "Public upload prestart files" ON storage.objects;
CREATE POLICY "Public upload prestart files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'prestart-uploads');
