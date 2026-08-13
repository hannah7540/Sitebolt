-- SiteBolt: Company vehicle assignment on worker profiles

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS has_company_vehicle boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_vehicle_asset_id uuid
    REFERENCES organization_fleet(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workers_assigned_vehicle_asset_id
  ON workers(assigned_vehicle_asset_id);
