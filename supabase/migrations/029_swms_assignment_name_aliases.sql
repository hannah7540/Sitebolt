-- Legacy assignee name aliases on SWMS assignments
ALTER TABLE swms_assignments
  ADD COLUMN IF NOT EXISTS worker_name text;

ALTER TABLE swms_assignments
  ADD COLUMN IF NOT EXISTS subcontractor_name text;

ALTER TABLE swms_assignments
  ADD COLUMN IF NOT EXISTS name text;

COMMENT ON COLUMN swms_assignments.worker_name IS 'Legacy alias for assignee_name on worker assignments';
COMMENT ON COLUMN swms_assignments.subcontractor_name IS 'Legacy alias for assignee_name on subcontractor assignments';
COMMENT ON COLUMN swms_assignments.name IS 'Legacy alias for assignee_name';
