-- SiteBolt: Organisation fleet vehicles and compliance documents

CREATE TABLE IF NOT EXISTS organization_fleet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_number text NOT NULL,
  make text,
  model text,
  registration text,
  rego_expiry_date date,
  rego_document_url text,
  insurance_expiry_date date,
  insurance_document_url text,
  current_hours numeric(10, 2) NOT NULL DEFAULT 0,
  assigned_worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
  assigned_worker_name text,
  assigned_project_id uuid,
  assigned_project_name text,
  status text NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Active', 'Maintenance', 'Out of Service')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_fleet_unit_number
  ON organization_fleet(unit_number);
CREATE INDEX IF NOT EXISTS idx_organization_fleet_status
  ON organization_fleet(status);
CREATE INDEX IF NOT EXISTS idx_organization_fleet_rego_expiry
  ON organization_fleet(rego_expiry_date);
CREATE INDEX IF NOT EXISTS idx_organization_fleet_insurance_expiry
  ON organization_fleet(insurance_expiry_date);

ALTER TABLE organization_fleet ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read organization_fleet" ON organization_fleet;
CREATE POLICY "Allow public read organization_fleet"
  ON organization_fleet FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert organization_fleet" ON organization_fleet;
CREATE POLICY "Allow public insert organization_fleet"
  ON organization_fleet FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update organization_fleet" ON organization_fleet;
CREATE POLICY "Allow public update organization_fleet"
  ON organization_fleet FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete organization_fleet" ON organization_fleet;
CREATE POLICY "Allow public delete organization_fleet"
  ON organization_fleet FOR DELETE USING (true);

COMMENT ON TABLE organization_fleet IS
  'Organisation-owned fleet vehicles (utes, trucks) with rego and insurance compliance';
