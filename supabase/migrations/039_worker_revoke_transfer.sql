-- Worker revoke/archive fields and assignment transfer support
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS is_revoked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trade text;

COMMENT ON COLUMN workers.is_revoked IS 'When true, worker is revoked from active organisation lists';
COMMENT ON COLUMN workers.trade IS 'Trade or job role (e.g. Electrician, Carpenter)';

DROP POLICY IF EXISTS "Allow public update project_worker_assignments" ON project_worker_assignments;
CREATE POLICY "Allow public update project_worker_assignments"
  ON project_worker_assignments FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public update workers" ON workers;
CREATE POLICY "Allow public update workers"
  ON workers FOR UPDATE USING (true);
