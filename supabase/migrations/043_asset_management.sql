-- SiteBolt: Asset management (Site Lasers, Pressure Gauges, vendors, project assignments)
-- Run in Supabase SQL Editor after previous migrations

CREATE TABLE IF NOT EXISTS asset_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  supported_asset_types text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_vendors_company_name
  ON asset_vendors(company_name);

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_number text NOT NULL,
  name text NOT NULL DEFAULT '',
  asset_type text NOT NULL CHECK (asset_type IN ('site_laser', 'pressure_gauge')),
  make text,
  model text,
  serial_number text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'in_service_calibration')),
  next_service_due_date date,
  next_calibration_due_date date,
  assigned_project_id text,
  vendor_id uuid REFERENCES asset_vendors(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assets_asset_number ON assets(asset_number);
CREATE INDEX IF NOT EXISTS idx_assets_asset_type ON assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_assigned_project_id ON assets(assigned_project_id);

CREATE TABLE IF NOT EXISTS project_asset_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_project_asset_assignments_project_id
  ON project_asset_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_asset_assignments_asset_id
  ON project_asset_assignments(asset_id);

CREATE TABLE IF NOT EXISTS asset_laser_signouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  worker_name text,
  signed_out_at timestamptz NOT NULL DEFAULT now(),
  signed_in_at timestamptz,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_asset_laser_signouts_asset_id
  ON asset_laser_signouts(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_laser_signouts_project_id
  ON asset_laser_signouts(project_id);
CREATE INDEX IF NOT EXISTS idx_asset_laser_signouts_signed_out_at
  ON asset_laser_signouts(signed_out_at);

ALTER TABLE asset_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_asset_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_laser_signouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read asset_vendors" ON asset_vendors;
CREATE POLICY "Allow public read asset_vendors"
  ON asset_vendors FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert asset_vendors" ON asset_vendors;
CREATE POLICY "Allow public insert asset_vendors"
  ON asset_vendors FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update asset_vendors" ON asset_vendors;
CREATE POLICY "Allow public update asset_vendors"
  ON asset_vendors FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete asset_vendors" ON asset_vendors;
CREATE POLICY "Allow public delete asset_vendors"
  ON asset_vendors FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read assets" ON assets;
CREATE POLICY "Allow public read assets"
  ON assets FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert assets" ON assets;
CREATE POLICY "Allow public insert assets"
  ON assets FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update assets" ON assets;
CREATE POLICY "Allow public update assets"
  ON assets FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete assets" ON assets;
CREATE POLICY "Allow public delete assets"
  ON assets FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read project_asset_assignments" ON project_asset_assignments;
CREATE POLICY "Allow public read project_asset_assignments"
  ON project_asset_assignments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert project_asset_assignments" ON project_asset_assignments;
CREATE POLICY "Allow public insert project_asset_assignments"
  ON project_asset_assignments FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public delete project_asset_assignments" ON project_asset_assignments;
CREATE POLICY "Allow public delete project_asset_assignments"
  ON project_asset_assignments FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read asset_laser_signouts" ON asset_laser_signouts;
CREATE POLICY "Allow public read asset_laser_signouts"
  ON asset_laser_signouts FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert asset_laser_signouts" ON asset_laser_signouts;
CREATE POLICY "Allow public insert asset_laser_signouts"
  ON asset_laser_signouts FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update asset_laser_signouts" ON asset_laser_signouts;
CREATE POLICY "Allow public update asset_laser_signouts"
  ON asset_laser_signouts FOR UPDATE USING (true);

COMMENT ON TABLE assets IS 'Organisation assets: Site Lasers and Pressure Gauges';
COMMENT ON COLUMN assets.asset_type IS 'site_laser | pressure_gauge';
COMMENT ON COLUMN assets.status IS 'active | in_service_calibration';
COMMENT ON TABLE asset_vendors IS 'Calibration and service provider directory';
