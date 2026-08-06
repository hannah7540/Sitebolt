-- SiteBolt: Drawing pin dropper, batch items, service spec rules, inspection activities

CREATE TABLE IF NOT EXISTS itc_project_drawings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL DEFAULT 'image/png',
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itc_project_drawings_project
  ON itc_project_drawings(project_id);

CREATE TABLE IF NOT EXISTS itc_service_spec_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type text NOT NULL,
  material_and_size text NOT NULL,
  min_horizontal_sep_mm numeric(8, 2),
  min_vertical_sep_mm numeric(8, 2),
  min_bedding_mm numeric(8, 2),
  min_side_mm numeric(8, 2),
  min_overlay_mm numeric(8, 2),
  min_cover_mm numeric(8, 2),
  bedding_and_overlay_material text,
  cover_material text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_type, material_and_size)
);

CREATE TABLE IF NOT EXISTS itc_drawing_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_id uuid NOT NULL REFERENCES itc_project_drawings(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  map_x numeric(6, 4) NOT NULL,
  map_y numeric(6, 4) NOT NULL,
  service_type text NOT NULL,
  upstream_pit_number text,
  downstream_pit_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itc_drawing_pins_drawing ON itc_drawing_pins(drawing_id);

CREATE TABLE IF NOT EXISTS itc_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  drawing_id uuid REFERENCES itc_project_drawings(id) ON DELETE SET NULL,
  pin_id uuid REFERENCES itc_drawing_pins(id) ON DELETE SET NULL,
  service_type text NOT NULL,
  zone text,
  plan_rev text,
  material_and_size text,
  length_between_structures_m numeric(10, 2),
  upstream_pit_number text,
  downstream_pit_number text,
  number_of_conduits integer,
  min_horizontal_sep_mm numeric(8, 2),
  min_vertical_sep_mm numeric(8, 2),
  min_bedding_mm numeric(8, 2),
  min_side_mm numeric(8, 2),
  min_overlay_mm numeric(8, 2),
  min_cover_mm numeric(8, 2),
  bedding_and_overlay_material text,
  cover_material text,
  map_x numeric(6, 4),
  map_y numeric(6, 4),
  itc_number text,
  generated_itc_id uuid REFERENCES project_itcs(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'generated', 'complete')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itc_batch_items_project ON itc_batch_items(project_id);
CREATE INDEX IF NOT EXISTS idx_itc_batch_items_service ON itc_batch_items(service_type);
CREATE INDEX IF NOT EXISTS idx_itc_batch_items_itc_number ON itc_batch_items(itc_number);

CREATE TABLE IF NOT EXISTS itc_inspection_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itc_id uuid NOT NULL REFERENCES project_itcs(id) ON DELETE CASCADE,
  activity_number integer NOT NULL,
  title text NOT NULL,
  requires_photo boolean NOT NULL DEFAULT false,
  check_by text,
  checked_date date,
  comments text,
  photo_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (itc_id, activity_number)
);

CREATE INDEX IF NOT EXISTS idx_itc_inspection_activities_itc ON itc_inspection_activities(itc_id);

ALTER TABLE project_itcs
  ADD COLUMN IF NOT EXISTS package_name text,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS material_and_size text,
  ADD COLUMN IF NOT EXISTS upstream_pit_number text,
  ADD COLUMN IF NOT EXISTS downstream_pit_number text,
  ADD COLUMN IF NOT EXISTS number_of_conduits integer,
  ADD COLUMN IF NOT EXISTS min_horizontal_sep_mm numeric(8, 2),
  ADD COLUMN IF NOT EXISTS min_vertical_sep_mm numeric(8, 2),
  ADD COLUMN IF NOT EXISTS min_bedding_mm numeric(8, 2),
  ADD COLUMN IF NOT EXISTS min_side_mm numeric(8, 2),
  ADD COLUMN IF NOT EXISTS min_overlay_mm numeric(8, 2),
  ADD COLUMN IF NOT EXISTS min_cover_mm numeric(8, 2),
  ADD COLUMN IF NOT EXISTS bedding_and_overlay_material text,
  ADD COLUMN IF NOT EXISTS cover_material text,
  ADD COLUMN IF NOT EXISTS batch_item_id uuid REFERENCES itc_batch_items(id) ON DELETE SET NULL;

ALTER TABLE itc_project_drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE itc_service_spec_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE itc_drawing_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE itc_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE itc_inspection_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read itc_project_drawings" ON itc_project_drawings;
CREATE POLICY "Allow public read itc_project_drawings" ON itc_project_drawings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write itc_project_drawings" ON itc_project_drawings;
CREATE POLICY "Allow public write itc_project_drawings" ON itc_project_drawings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read itc_service_spec_rules" ON itc_service_spec_rules;
CREATE POLICY "Allow public read itc_service_spec_rules" ON itc_service_spec_rules FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write itc_service_spec_rules" ON itc_service_spec_rules;
CREATE POLICY "Allow public write itc_service_spec_rules" ON itc_service_spec_rules FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read itc_drawing_pins" ON itc_drawing_pins;
CREATE POLICY "Allow public read itc_drawing_pins" ON itc_drawing_pins FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write itc_drawing_pins" ON itc_drawing_pins;
CREATE POLICY "Allow public write itc_drawing_pins" ON itc_drawing_pins FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read itc_batch_items" ON itc_batch_items;
CREATE POLICY "Allow public read itc_batch_items" ON itc_batch_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write itc_batch_items" ON itc_batch_items;
CREATE POLICY "Allow public write itc_batch_items" ON itc_batch_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read itc_inspection_activities" ON itc_inspection_activities;
CREATE POLICY "Allow public read itc_inspection_activities" ON itc_inspection_activities FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write itc_inspection_activities" ON itc_inspection_activities;
CREATE POLICY "Allow public write itc_inspection_activities" ON itc_inspection_activities FOR ALL USING (true) WITH CHECK (true);

INSERT INTO itc_service_spec_rules (
  service_type, material_and_size,
  min_horizontal_sep_mm, min_vertical_sep_mm, min_bedding_mm, min_side_mm,
  min_overlay_mm, min_cover_mm, bedding_and_overlay_material, cover_material, sort_order
) VALUES
  ('HV', '4 x 100mm HD Orange Conduit', 300, 150, 75, 150, 75, 600, 'Bed Sand', 'Roadbase', 1),
  ('HV', '2 x 100mm HD Orange Conduit', 300, 150, 75, 150, 75, 600, 'Bed Sand', 'Roadbase', 2),
  ('LV', '4 x 50mm HD Orange Conduit', 200, 100, 50, 100, 50, 450, 'Bed Sand', 'Roadbase', 1),
  ('LV', '2 x 32mm HD Orange Conduit', 200, 100, 50, 100, 50, 450, 'Bed Sand', 'Roadbase', 2),
  ('Comms', '2 x 50mm White Conduit', 150, 75, 50, 75, 50, 450, 'Bed Sand', 'Roadbase', 1),
  ('Comms', '4 x 40mm White Conduit', 150, 75, 50, 75, 50, 450, 'Bed Sand', 'Roadbase', 2),
  ('Sewer', '225mm PVC SN8', 1000, 300, 100, 150, 100, 900, 'Bed Sand', 'Roadbase', 1),
  ('Sewer', '300mm PVC SN8', 1000, 300, 100, 150, 100, 900, 'Bed Sand', 'Roadbase', 2),
  ('Stormwater', '450mm RCP Class 4', 1000, 300, 100, 150, 100, 900, 'Bed Sand', 'Roadbase', 1),
  ('Stormwater', '375mm RCP Class 4', 1000, 300, 100, 150, 100, 900, 'Bed Sand', 'Roadbase', 2),
  ('Potable Water', '125mm PN16 PE100', 500, 200, 75, 150, 75, 600, 'Bed Sand', 'Roadbase', 1),
  ('Potable Water', '180mm PN16 PE100', 500, 200, 75, 150, 75, 600, 'Bed Sand', 'Roadbase', 2)
ON CONFLICT (service_type, material_and_size) DO NOTHING;

COMMENT ON TABLE itc_batch_items IS 'Mass-generated ITC rows from drawing pin dropper workflow';
COMMENT ON TABLE itc_inspection_activities IS '14 standard inspection activity rows per generated ITC';

INSERT INTO storage.buckets (id, name, public)
VALUES ('itp-drawings', 'itp-drawings', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow public read itp-drawings" ON storage.objects;
CREATE POLICY "Allow public read itp-drawings"
  ON storage.objects FOR SELECT USING (bucket_id = 'itp-drawings');
DROP POLICY IF EXISTS "Allow public insert itp-drawings" ON storage.objects;
CREATE POLICY "Allow public insert itp-drawings"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'itp-drawings');
DROP POLICY IF EXISTS "Allow public update itp-drawings" ON storage.objects;
CREATE POLICY "Allow public update itp-drawings"
  ON storage.objects FOR UPDATE USING (bucket_id = 'itp-drawings');
