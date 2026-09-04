-- Re-ensure fleet columns and restore write access after 090 dropped
-- the permissive "Allow public %" policies. Admin console inserts were
-- then denied by RLS and surfaced as a false "run migration 056" error.

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
  assigned_worker_id uuid,
  assigned_worker_name text,
  assigned_project_id text,
  assigned_project_name text,
  status text NOT NULL DEFAULT 'Active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organization_fleet
  ADD COLUMN IF NOT EXISTS unit_number text,
  ADD COLUMN IF NOT EXISTS make text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS registration text,
  ADD COLUMN IF NOT EXISTS rego_expiry_date date,
  ADD COLUMN IF NOT EXISTS rego_document_url text,
  ADD COLUMN IF NOT EXISTS insurance_expiry_date date,
  ADD COLUMN IF NOT EXISTS insurance_document_url text,
  ADD COLUMN IF NOT EXISTS current_hours numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assigned_worker_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_worker_name text,
  ADD COLUMN IF NOT EXISTS assigned_project_id text,
  ADD COLUMN IF NOT EXISTS assigned_project_name text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE organization_fleet ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON organization_fleet TO anon, authenticated;

DROP POLICY IF EXISTS "Authenticated read organization_fleet" ON organization_fleet;
CREATE POLICY "Authenticated read organization_fleet"
  ON organization_fleet FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated insert organization_fleet" ON organization_fleet;
CREATE POLICY "Authenticated insert organization_fleet"
  ON organization_fleet FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update organization_fleet" ON organization_fleet;
CREATE POLICY "Authenticated update organization_fleet"
  ON organization_fleet FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated delete organization_fleet" ON organization_fleet;
CREATE POLICY "Authenticated delete organization_fleet"
  ON organization_fleet FOR DELETE
  USING (true);

NOTIFY pgrst, 'reload schema';
