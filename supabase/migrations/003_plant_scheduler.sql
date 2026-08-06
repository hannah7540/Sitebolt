-- SiteBolt: Plant fleet scheduler & project allocation
-- Run in Supabase SQL Editor after previous migrations

ALTER TABLE plant
  ADD COLUMN IF NOT EXISTS assigned_project_id text,
  ADD COLUMN IF NOT EXISTS assigned_project_name text;

CREATE TABLE IF NOT EXISTS plant_service_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id uuid NOT NULL REFERENCES plant(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  service_type text NOT NULL,
  technician_notes text,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plant_service_schedules_plant_id
  ON plant_service_schedules(plant_id);
CREATE INDEX IF NOT EXISTS idx_plant_service_schedules_date
  ON plant_service_schedules(scheduled_date);

ALTER TABLE plant_service_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read plant_service_schedules" ON plant_service_schedules;
CREATE POLICY "Allow public read plant_service_schedules"
  ON plant_service_schedules FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert plant_service_schedules" ON plant_service_schedules;
CREATE POLICY "Allow public insert plant_service_schedules"
  ON plant_service_schedules FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update plant_service_schedules" ON plant_service_schedules;
CREATE POLICY "Allow public update plant_service_schedules"
  ON plant_service_schedules FOR UPDATE USING (true);
