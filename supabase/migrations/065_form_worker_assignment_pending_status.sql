-- Allow capitalized Pending status on form worker assignments

ALTER TABLE form_worker_assignments
  DROP CONSTRAINT IF EXISTS form_worker_assignments_status_check;

ALTER TABLE form_worker_assignments
  ADD CONSTRAINT form_worker_assignments_status_check
  CHECK (status IN ('pending', 'Pending', 'in_progress', 'completed'));

UPDATE form_worker_assignments
SET status = 'Pending'
WHERE status = 'pending';

COMMENT ON COLUMN form_worker_assignments.status IS 'Assignment status (Pending/pending, in_progress, completed)';
