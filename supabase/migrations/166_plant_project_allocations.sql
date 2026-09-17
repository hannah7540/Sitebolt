-- Open-ended plant project allocations with effective_from / effective_to.

CREATE TABLE IF NOT EXISTS plant_project_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id text NOT NULL,
  project_id text,
  effective_from date NOT NULL,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plant_project_allocations_plant_id
  ON plant_project_allocations(plant_id);

CREATE INDEX IF NOT EXISTS idx_plant_project_allocations_dates
  ON plant_project_allocations(plant_id, effective_from, effective_to);

ALTER TABLE plant_project_allocations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON plant_project_allocations TO anon, authenticated;

DROP POLICY IF EXISTS "Authenticated read plant_project_allocations" ON plant_project_allocations;
CREATE POLICY "Authenticated read plant_project_allocations"
  ON plant_project_allocations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated insert plant_project_allocations" ON plant_project_allocations;
CREATE POLICY "Authenticated insert plant_project_allocations"
  ON plant_project_allocations FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update plant_project_allocations" ON plant_project_allocations;
CREATE POLICY "Authenticated update plant_project_allocations"
  ON plant_project_allocations FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated delete plant_project_allocations" ON plant_project_allocations;
CREATE POLICY "Authenticated delete plant_project_allocations"
  ON plant_project_allocations FOR DELETE USING (true);

ALTER TABLE plant
  ADD COLUMN IF NOT EXISTS assigned_date date;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'plant_equipment'
  ) THEN
    ALTER TABLE plant_equipment
      ADD COLUMN IF NOT EXISTS assigned_date date;
  END IF;
END $$;
