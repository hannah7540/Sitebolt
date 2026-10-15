-- Intermediate "checked" review step for Accounts timesheets.
-- Safe to re-run: production may already have these columns.

ALTER TABLE public.worker_timesheets
  ADD COLUMN IF NOT EXISTS is_checked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_by uuid;

CREATE INDEX IF NOT EXISTS idx_worker_timesheets_is_checked
  ON public.worker_timesheets (is_checked);

COMMENT ON COLUMN public.worker_timesheets.is_checked IS
  'Accounts review flag: true after an admin marks the timesheet as checked.';
COMMENT ON COLUMN public.worker_timesheets.checked_at IS
  'When the timesheet was marked as checked.';
COMMENT ON COLUMN public.worker_timesheets.checked_by IS
  'Auth user id of the admin who marked the timesheet as checked.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'timesheets'
  ) THEN
    ALTER TABLE public.timesheets
      ADD COLUMN IF NOT EXISTS is_checked boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS checked_at timestamptz,
      ADD COLUMN IF NOT EXISTS checked_by uuid;
  END IF;
END $$;
