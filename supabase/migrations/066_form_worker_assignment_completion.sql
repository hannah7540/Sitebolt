-- Completion payload columns and expanded status values for form worker assignments

ALTER TABLE form_worker_assignments
  ADD COLUMN IF NOT EXISTS responses jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE form_worker_assignments
  ADD COLUMN IF NOT EXISTS signature_url text;

ALTER TABLE form_worker_assignments
  DROP CONSTRAINT IF EXISTS form_worker_assignments_status_check;

ALTER TABLE form_worker_assignments
  ADD CONSTRAINT form_worker_assignments_status_check
  CHECK (
    status IN (
      'pending',
      'Pending',
      'in_progress',
      'In Progress',
      'completed',
      'Completed'
    )
  );

COMMENT ON COLUMN form_worker_assignments.responses IS 'Worker induction form answers keyed by field id';
COMMENT ON COLUMN form_worker_assignments.signature_url IS 'Captured signature data URL or storage path';
