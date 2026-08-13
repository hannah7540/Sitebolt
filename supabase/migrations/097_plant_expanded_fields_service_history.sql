-- SiteBolt: Expanded plant fields, worker assignment, and service history

ALTER TABLE plant
  ADD COLUMN IF NOT EXISTS service_contact_company text,
  ADD COLUMN IF NOT EXISTS service_contact_email text,
  ADD COLUMN IF NOT EXISTS assigned_worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_worker_name text;

CREATE INDEX IF NOT EXISTS idx_plant_assigned_worker_id
  ON plant(assigned_worker_id);

CREATE TABLE IF NOT EXISTS plant_service_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id uuid NOT NULL REFERENCES plant(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  hours_logged numeric,
  description text,
  technician_company text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plant_service_history_plant_id
  ON plant_service_history(plant_id);
CREATE INDEX IF NOT EXISTS idx_plant_service_history_service_date
  ON plant_service_history(service_date DESC);

ALTER TABLE plant_service_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read plant_service_history" ON plant_service_history;
CREATE POLICY "Allow public read plant_service_history"
  ON plant_service_history FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert plant_service_history" ON plant_service_history;
CREATE POLICY "Allow public insert plant_service_history"
  ON plant_service_history FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update plant_service_history" ON plant_service_history;
CREATE POLICY "Allow public update plant_service_history"
  ON plant_service_history FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete plant_service_history" ON plant_service_history;
CREATE POLICY "Allow public delete plant_service_history"
  ON plant_service_history FOR DELETE USING (true);
