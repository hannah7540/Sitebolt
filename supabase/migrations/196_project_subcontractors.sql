-- Junction table for subcontractor company ↔ project assignments.

CREATE TABLE IF NOT EXISTS project_subcontractors (
  project_id uuid NOT NULL,
  subcontractor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, subcontractor_id)
);

CREATE INDEX IF NOT EXISTS idx_project_subcontractors_subcontractor
  ON project_subcontractors (subcontractor_id);

ALTER TABLE subcontractors
  ADD COLUMN IF NOT EXISTS assigned_project_ids text[] NOT NULL DEFAULT '{}'::text[];

NOTIFY pgrst, 'reload schema';
