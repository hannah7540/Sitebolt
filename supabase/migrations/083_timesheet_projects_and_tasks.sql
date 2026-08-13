-- Timesheet project/task picklists for worker timesheet submissions

CREATE TABLE IF NOT EXISTS timesheet_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client text NOT NULL,
  project text NOT NULL,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS timesheet_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timesheet_projects_client
  ON timesheet_projects(client);

CREATE INDEX IF NOT EXISTS idx_timesheet_projects_active
  ON timesheet_projects(is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_timesheet_tasks_active
  ON timesheet_tasks(is_active)
  WHERE is_active = true;

ALTER TABLE timesheet_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read timesheet_projects" ON timesheet_projects;
CREATE POLICY "Allow public read timesheet_projects"
  ON timesheet_projects FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read timesheet_tasks" ON timesheet_tasks;
CREATE POLICY "Allow public read timesheet_tasks"
  ON timesheet_tasks FOR SELECT USING (true);

NOTIFY pgrst, 'reload schema';
