-- Project managers and administrators (worker UUID arrays)

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_managers text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS project_administrators text[] DEFAULT '{}'::text[];

UPDATE projects
SET project_administrators = project_admins
WHERE project_administrators IS NULL
   OR project_administrators = '{}'::text[]
  AND project_admins IS NOT NULL
  AND project_admins <> '{}'::text[];

COMMENT ON COLUMN projects.project_managers IS 'Worker UUIDs assigned as project managers';
COMMENT ON COLUMN projects.project_administrators IS 'Worker UUIDs assigned as project administrators';
