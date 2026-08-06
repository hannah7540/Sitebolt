-- Primary plant registry for subcontractor and owned equipment
CREATE TABLE IF NOT EXISTS plant_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id uuid REFERENCES subcontractors(id) ON DELETE SET NULL,
  unit_number text NOT NULL,
  unit_reference text,
  equipment_category text,
  make text,
  model text,
  serial_number text,
  current_hours numeric NOT NULL DEFAULT 0,
  next_service_hours numeric NOT NULL DEFAULT 250,
  last_service_date date,
  service_history_doc_url text,
  plant_risk_assessment_doc_url text,
  is_subcontractor_plant boolean NOT NULL DEFAULT false,
  ownership_type text,
  status text NOT NULL DEFAULT 'Available',
  assigned_project_ids text[] NOT NULL DEFAULT '{}'::text[],
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plant_equipment_subcontractor_id
  ON plant_equipment(subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_plant_equipment_unit_number
  ON plant_equipment(unit_number);

ALTER TABLE plant_equipment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read plant_equipment" ON plant_equipment;
CREATE POLICY "Allow public read plant_equipment"
  ON plant_equipment FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert plant_equipment" ON plant_equipment;
CREATE POLICY "Allow public insert plant_equipment"
  ON plant_equipment FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update plant_equipment" ON plant_equipment;
CREATE POLICY "Allow public update plant_equipment"
  ON plant_equipment FOR UPDATE USING (true);

-- Legacy fallback table alignment
ALTER TABLE subcontractor_plant
  ADD COLUMN IF NOT EXISTS unit_reference text;
