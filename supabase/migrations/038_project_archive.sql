-- Project archiving and extended organisation fields
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS project_code text,
  ADD COLUMN IF NOT EXISTS client text;

COMMENT ON COLUMN projects.is_archived IS 'When true, project is hidden from active navigation';
COMMENT ON COLUMN projects.status IS 'Active or Archived display status';
COMMENT ON COLUMN projects.project_code IS 'Internal project number or code';
COMMENT ON COLUMN projects.client IS 'Client or principal name';

UPDATE projects
SET
  status = CASE WHEN COALESCE(is_active, true) = false THEN 'Archived' ELSE 'Active' END,
  is_archived = COALESCE(is_active, true) = false
WHERE status IS NULL OR status = 'Active' AND is_archived = false;

DROP POLICY IF EXISTS "Allow public update projects" ON projects;
CREATE POLICY "Allow public update projects"
  ON projects FOR UPDATE USING (true);
