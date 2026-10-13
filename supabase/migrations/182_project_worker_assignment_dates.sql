-- Permanent worker project transfers: dated assignment history + open-ended current rows.
-- Historical rows keep start/end dates. Active assignments use end_date IS NULL.

ALTER TABLE public.project_worker_assignments
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date;

UPDATE public.project_worker_assignments
SET start_date = COALESCE(start_date, created_at::date, CURRENT_DATE)
WHERE start_date IS NULL;

ALTER TABLE public.worker_schedule
  ALTER COLUMN end_date DROP NOT NULL;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  WHERE con.conrelid = 'public.project_worker_assignments'::regclass
    AND con.contype = 'u'
    AND pg_get_constraintdef(con.oid) ILIKE '%project_id%'
    AND pg_get_constraintdef(con.oid) ILIKE '%worker_id%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.project_worker_assignments DROP CONSTRAINT %I',
      constraint_name
    );
  END IF;
END $$;

DROP INDEX IF EXISTS public.project_worker_assignments_project_id_worker_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS project_worker_assignments_active_unique
  ON public.project_worker_assignments (project_id, worker_id)
  WHERE end_date IS NULL
    AND COALESCE(status, 'Active') NOT IN ('Transferred', 'Unassigned');

CREATE INDEX IF NOT EXISTS idx_project_worker_assignments_dates
  ON public.project_worker_assignments (worker_id, start_date, end_date);
