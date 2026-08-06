-- Legacy worker_id alias on SWMS assignments for older records
ALTER TABLE swms_assignments
  ADD COLUMN IF NOT EXISTS worker_id uuid;

COMMENT ON COLUMN swms_assignments.worker_id IS 'Legacy alias for assignee_id on worker assignments';

CREATE INDEX IF NOT EXISTS idx_swms_assignments_worker_id ON swms_assignments(worker_id);
