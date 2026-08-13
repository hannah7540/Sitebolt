-- Dynamic asset fields by asset type (laptops, lasers, assigned accounts, etc.)

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS laser_type text,
  ADD COLUMN IF NOT EXISTS account_name text,
  ADD COLUMN IF NOT EXISTS account_reference text,
  ADD COLUMN IF NOT EXISTS assigned_worker_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_worker_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS project_id text;

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_laser_type_check;

ALTER TABLE assets
  ADD CONSTRAINT assets_laser_type_check
  CHECK (laser_type IS NULL OR laser_type IN ('pipe', 'rotating'));

COMMENT ON COLUMN assets.laser_type IS 'Laser instrument type: pipe or rotating.';
COMMENT ON COLUMN assets.account_name IS 'Display name for assigned account assets.';
COMMENT ON COLUMN assets.account_reference IS 'External account reference / identifier.';
COMMENT ON COLUMN assets.assigned_worker_id IS 'Primary worker assigned to laptop/iPad assets.';
COMMENT ON COLUMN assets.assigned_worker_ids IS 'Workers assigned to shared account assets.';
COMMENT ON COLUMN assets.project_id IS 'Project scope for the asset (mirrors assigned_project_id when set).';
