-- Worker ITC floorplan viewer + collaborative checklist entries

CREATE TABLE IF NOT EXISTS project_itc_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  plan_name text NOT NULL DEFAULT 'Floorplan',
  image_url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_itc_plans_project
  ON project_itc_plans(project_id, is_active);

CREATE TABLE IF NOT EXISTS itc_checklist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itc_id uuid NOT NULL REFERENCES project_itcs(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  item_label text NOT NULL,
  is_mandatory boolean NOT NULL DEFAULT true,
  is_checked boolean NOT NULL DEFAULT false,
  notes text,
  photo_url text,
  worker_id text,
  worker_name text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (itc_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_itc_checklist_entries_itc
  ON itc_checklist_entries(itc_id, sort_order);

ALTER TABLE project_itcs
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS completed_by text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS pin_x numeric(6, 4),
  ADD COLUMN IF NOT EXISTS pin_y numeric(6, 4);

UPDATE project_itcs
SET pin_x = map_x, pin_y = map_y
WHERE pin_x IS NULL AND map_x IS NOT NULL;

UPDATE project_itcs
SET pin_y = map_y
WHERE pin_y IS NULL AND map_y IS NOT NULL;

ALTER TABLE project_itcs DROP CONSTRAINT IF EXISTS project_itcs_status_check;
ALTER TABLE project_itcs ADD CONSTRAINT project_itcs_status_check
  CHECK (status IN ('not_started', 'in_progress', 'ongoing', 'issue', 'complete', 'completed'));

ALTER TABLE project_itc_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE itc_checklist_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read project_itc_plans" ON project_itc_plans;
CREATE POLICY "Allow public read project_itc_plans"
  ON project_itc_plans FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert project_itc_plans" ON project_itc_plans;
CREATE POLICY "Allow public insert project_itc_plans"
  ON project_itc_plans FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update project_itc_plans" ON project_itc_plans;
CREATE POLICY "Allow public update project_itc_plans"
  ON project_itc_plans FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public read itc_checklist_entries" ON itc_checklist_entries;
CREATE POLICY "Allow public read itc_checklist_entries"
  ON itc_checklist_entries FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert itc_checklist_entries" ON itc_checklist_entries;
CREATE POLICY "Allow public insert itc_checklist_entries"
  ON itc_checklist_entries FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update itc_checklist_entries" ON itc_checklist_entries;
CREATE POLICY "Allow public update itc_checklist_entries"
  ON itc_checklist_entries FOR UPDATE USING (true);

COMMENT ON TABLE project_itc_plans IS 'Active floorplan images for worker ITC map viewer';
COMMENT ON TABLE itc_checklist_entries IS 'Collaborative per-item ITC checklist entries';
