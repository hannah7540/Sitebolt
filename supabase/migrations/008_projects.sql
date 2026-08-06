-- SiteBolt: Add slug column to existing projects table
-- Run in Supabase SQL Editor
--
-- The SiteBolt app stores human-readable project titles in `project_name`
-- (see worker_schedule.project_name, plant.assigned_project_name).
-- This migration adds `slug` for legacy lookups like project-1 / project-3.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS slug text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug
  ON projects (slug)
  WHERE slug IS NOT NULL;

-- Populate slugs from the existing title column (project_name, title, or name)
DO $$
DECLARE
  title_col text;
BEGIN
  SELECT c.column_name
  INTO title_col
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'projects'
    AND c.column_name IN ('project_name', 'title', 'name', 'display_name')
  ORDER BY CASE c.column_name
    WHEN 'project_name' THEN 1
    WHEN 'title' THEN 2
    WHEN 'name' THEN 3
    WHEN 'display_name' THEN 4
  END
  LIMIT 1;

  IF title_col IS NULL THEN
    RAISE EXCEPTION
      'projects table has no recognized title column. Expected one of: project_name, title, name, display_name';
  END IF;

  RAISE NOTICE 'Using projects.% as the title column for slug backfill', title_col;

  IF title_col = 'project_name' THEN
    UPDATE projects SET slug = 'project-1' WHERE slug IS NULL AND project_name ILIKE '%Project 1%';
    UPDATE projects SET slug = 'project-2' WHERE slug IS NULL AND project_name ILIKE '%Project 2%';
    UPDATE projects SET slug = 'project-3' WHERE slug IS NULL AND project_name ILIKE '%Project 3%';
  ELSIF title_col = 'title' THEN
    UPDATE projects SET slug = 'project-1' WHERE slug IS NULL AND title ILIKE '%Project 1%';
    UPDATE projects SET slug = 'project-2' WHERE slug IS NULL AND title ILIKE '%Project 2%';
    UPDATE projects SET slug = 'project-3' WHERE slug IS NULL AND title ILIKE '%Project 3%';
  ELSIF title_col = 'name' THEN
    UPDATE projects SET slug = 'project-1' WHERE slug IS NULL AND name ILIKE '%Project 1%';
    UPDATE projects SET slug = 'project-2' WHERE slug IS NULL AND name ILIKE '%Project 2%';
    UPDATE projects SET slug = 'project-3' WHERE slug IS NULL AND name ILIKE '%Project 3%';
  ELSIF title_col = 'display_name' THEN
    UPDATE projects SET slug = 'project-1' WHERE slug IS NULL AND display_name ILIKE '%Project 1%';
    UPDATE projects SET slug = 'project-2' WHERE slug IS NULL AND display_name ILIKE '%Project 2%';
    UPDATE projects SET slug = 'project-3' WHERE slug IS NULL AND display_name ILIKE '%Project 3%';
  END IF;
END $$;

-- Seed rows only when the table is empty (uses project_name — adjust if your column differs)
DO $$
DECLARE
  title_col text;
  row_count integer;
BEGIN
  SELECT COUNT(*) INTO row_count FROM projects;
  IF row_count > 0 THEN
    RETURN;
  END IF;

  SELECT c.column_name
  INTO title_col
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'projects'
    AND c.column_name IN ('project_name', 'title', 'name', 'display_name')
  ORDER BY CASE c.column_name
    WHEN 'project_name' THEN 1
    WHEN 'title' THEN 2
    WHEN 'name' THEN 3
    WHEN 'display_name' THEN 4
  END
  LIMIT 1;

  IF title_col = 'project_name' THEN
    INSERT INTO projects (slug, project_name) VALUES
      ('project-1', 'Project 1'),
      ('project-2', 'Project 2'),
      ('project-3', 'Project 3');
  ELSIF title_col = 'title' THEN
    INSERT INTO projects (slug, title) VALUES
      ('project-1', 'Project 1'),
      ('project-2', 'Project 2'),
      ('project-3', 'Project 3');
  ELSIF title_col = 'name' THEN
    INSERT INTO projects (slug, name) VALUES
      ('project-1', 'Project 1'),
      ('project-2', 'Project 2'),
      ('project-3', 'Project 3');
  ELSIF title_col = 'display_name' THEN
    INSERT INTO projects (slug, display_name) VALUES
      ('project-1', 'Project 1'),
      ('project-2', 'Project 2'),
      ('project-3', 'Project 3');
  END IF;
END $$;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read projects" ON projects;
CREATE POLICY "Allow public read projects"
  ON projects FOR SELECT USING (true);
