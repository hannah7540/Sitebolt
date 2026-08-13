-- Per-step signature audit fields on ITC sign-offs.
-- Safe to re-run.

ALTER TABLE itc_signoffs
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_by_worker_id text;

COMMENT ON COLUMN itc_signoffs.signed_at IS
  'ISO timestamp when the worker submitted and locked this step sign-off.';
COMMENT ON COLUMN itc_signoffs.signed_by_worker_id IS
  'Worker id that submitted the step sign-off (same as author_id at submission time).';

-- Backfill existing submitted rows
UPDATE itc_signoffs
SET
  signed_at = COALESCE(signed_at, submitted_at),
  signed_by_worker_id = COALESCE(signed_by_worker_id, author_id)
WHERE status = 'submitted'
  AND (signed_at IS NULL OR signed_by_worker_id IS NULL);

NOTIFY pgrst, 'reload schema';
