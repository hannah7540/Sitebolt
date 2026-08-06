-- SiteBolt: Project ↔ plant/worker assignment junction tables
-- Run in Supabase SQL Editor after previous migrations

CREATE TABLE IF NOT EXISTS project_plant_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  plant_id uuid NOT NULL REFERENCES plant(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, plant_id)
);

CREATE INDEX IF NOT EXISTS idx_project_plant_assignments_project_id
  ON project_plant_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_plant_assignments_plant_id
  ON project_plant_assignments(plant_id);

CREATE TABLE IF NOT EXISTS project_worker_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_project_worker_assignments_project_id
  ON project_worker_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_worker_assignments_worker_id
  ON project_worker_assignments(worker_id);

ALTER TABLE project_plant_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_worker_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read project_plant_assignments" ON project_plant_assignments;
CREATE POLICY "Allow public read project_plant_assignments"
  ON project_plant_assignments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert project_plant_assignments" ON project_plant_assignments;
CREATE POLICY "Allow public insert project_plant_assignments"
  ON project_plant_assignments FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public delete project_plant_assignments" ON project_plant_assignments;
CREATE POLICY "Allow public delete project_plant_assignments"
  ON project_plant_assignments FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read project_worker_assignments" ON project_worker_assignments;
CREATE POLICY "Allow public read project_worker_assignments"
  ON project_worker_assignments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert project_worker_assignments" ON project_worker_assignments;
CREATE POLICY "Allow public insert project_worker_assignments"
  ON project_worker_assignments FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public delete project_worker_assignments" ON project_worker_assignments;
CREATE POLICY "Allow public delete project_worker_assignments"
  ON project_worker_assignments FOR DELETE USING (true);
