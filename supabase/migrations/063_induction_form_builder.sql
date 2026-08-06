-- SiteBolt: Induction form templates and worker assignments

CREATE TABLE IF NOT EXISTS induction_form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  form_type text NOT NULL DEFAULT 'Induction',
  scope text NOT NULL DEFAULT 'company'
    CHECK (scope IN ('company', 'project')),
  project_id text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('active', 'draft')),
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  copied_from_id uuid REFERENCES induction_form_templates(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_induction_form_templates_status
  ON induction_form_templates(status);
CREATE INDEX IF NOT EXISTS idx_induction_form_templates_scope
  ON induction_form_templates(scope);
CREATE INDEX IF NOT EXISTS idx_induction_form_templates_project
  ON induction_form_templates(project_id);

CREATE TABLE IF NOT EXISTS form_worker_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES induction_form_templates(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  project_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  assigned_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_form_worker_assignments_worker
  ON form_worker_assignments(worker_id);
CREATE INDEX IF NOT EXISTS idx_form_worker_assignments_status
  ON form_worker_assignments(status);
CREATE INDEX IF NOT EXISTS idx_form_worker_assignments_form
  ON form_worker_assignments(form_id);

ALTER TABLE induction_form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_worker_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read induction_form_templates" ON induction_form_templates;
CREATE POLICY "Allow public read induction_form_templates"
  ON induction_form_templates FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write induction_form_templates" ON induction_form_templates;
CREATE POLICY "Allow public write induction_form_templates"
  ON induction_form_templates FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read form_worker_assignments" ON form_worker_assignments;
CREATE POLICY "Allow public read form_worker_assignments"
  ON form_worker_assignments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write form_worker_assignments" ON form_worker_assignments;
CREATE POLICY "Allow public write form_worker_assignments"
  ON form_worker_assignments FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE induction_form_templates IS 'Configurable induction form templates with JSON block builder';
COMMENT ON TABLE form_worker_assignments IS 'Worker induction assignments with pending/completed status';
