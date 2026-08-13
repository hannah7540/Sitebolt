-- ITC & Compaction Management: master spec workbook, multi-worker step photos, GPS compaction

CREATE TABLE IF NOT EXISTS itc_master_specs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  discipline text NOT NULL
    CHECK (discipline IN ('Electrical', 'Drainage', 'Hydraulics')),
  sub_services jsonb NOT NULL DEFAULT '[]'::jsonb,
  zones jsonb NOT NULL DEFAULT '[]'::jsonb,
  pit_numbers jsonb NOT NULL DEFAULT '[]'::jsonb,
  materials jsonb NOT NULL DEFAULT '[]'::jsonb,
  bedding_cover_specs jsonb NOT NULL DEFAULT '[]'::jsonb,
  rover_serial_numbers jsonb NOT NULL DEFAULT '[]'::jsonb,
  rover_operators jsonb NOT NULL DEFAULT '[]'::jsonb,
  service_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  redline_markup_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, discipline)
);

CREATE INDEX IF NOT EXISTS idx_itc_master_specs_project
  ON itc_master_specs(project_id);

CREATE TABLE IF NOT EXISTS itc_step_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itc_id uuid NOT NULL REFERENCES project_itcs(id) ON DELETE CASCADE,
  step_key text NOT NULL DEFAULT 'general',
  activity_number integer,
  photo_url text NOT NULL,
  gps_lat numeric(10, 7),
  gps_lng numeric(10, 7),
  captured_at timestamptz,
  uploaded_by text,
  uploaded_by_name text,
  is_approved_for_export boolean NOT NULL DEFAULT false,
  approved_by text,
  approved_by_name text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itc_step_photos_itc
  ON itc_step_photos(itc_id);
CREATE INDEX IF NOT EXISTS idx_itc_step_photos_step
  ON itc_step_photos(itc_id, step_key);

ALTER TABLE itc_compaction_tests
  ADD COLUMN IF NOT EXISTS gps_lat numeric(10, 7),
  ADD COLUMN IF NOT EXISTS gps_lng numeric(10, 7),
  ADD COLUMN IF NOT EXISTS tested_at timestamptz,
  ADD COLUMN IF NOT EXISTS map_lat numeric(10, 7),
  ADD COLUMN IF NOT EXISTS map_lng numeric(10, 7);

ALTER TABLE project_itcs
  ADD COLUMN IF NOT EXISTS gps_lat numeric(10, 7),
  ADD COLUMN IF NOT EXISTS gps_lng numeric(10, 7),
  ADD COLUMN IF NOT EXISTS trade_discipline text,
  ADD COLUMN IF NOT EXISTS service_type text,
  ADD COLUMN IF NOT EXISTS material_colour text,
  ADD COLUMN IF NOT EXISTS length_of_run_m numeric(10, 2),
  ADD COLUMN IF NOT EXISTS number_of_tees integer,
  ADD COLUMN IF NOT EXISTS redline_markup_url text,
  ADD COLUMN IF NOT EXISTS form_data jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE itc_master_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE itc_step_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read itc_master_specs" ON itc_master_specs;
CREATE POLICY "Allow public read itc_master_specs"
  ON itc_master_specs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write itc_master_specs" ON itc_master_specs;
CREATE POLICY "Allow public write itc_master_specs"
  ON itc_master_specs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read itc_step_photos" ON itc_step_photos;
CREATE POLICY "Allow public read itc_step_photos"
  ON itc_step_photos FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write itc_step_photos" ON itc_step_photos;
CREATE POLICY "Allow public write itc_step_photos"
  ON itc_step_photos FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE itc_master_specs IS 'Site-wide master specification workbook per trade discipline';
COMMENT ON TABLE itc_step_photos IS 'Multi-worker photo pool per ITC step; admin stars approved export photos';
