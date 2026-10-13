-- Permanent plant project transfers: dated assignment history + open-ended current rows.
-- Historical rows keep start/end dates. Active assignments use end_date IS NULL.

ALTER TABLE public.project_plant_assignments
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date;

UPDATE public.project_plant_assignments
SET start_date = COALESCE(start_date, created_at::date, CURRENT_DATE)
WHERE start_date IS NULL;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  WHERE con.conrelid = 'public.project_plant_assignments'::regclass
    AND con.contype = 'u'
    AND pg_get_constraintdef(con.oid) ILIKE '%project_id%'
    AND pg_get_constraintdef(con.oid) ILIKE '%plant_id%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.project_plant_assignments DROP CONSTRAINT %I',
      constraint_name
    );
  END IF;
END $$;

DROP INDEX IF EXISTS public.project_plant_assignments_project_id_plant_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS project_plant_assignments_active_unique
  ON public.project_plant_assignments (project_id, plant_id)
  WHERE end_date IS NULL
    AND COALESCE(status, 'Assigned') NOT IN ('Transferred', 'Unassigned');

CREATE INDEX IF NOT EXISTS idx_project_plant_assignments_dates
  ON public.project_plant_assignments (plant_id, start_date, end_date);

DROP POLICY IF EXISTS "Allow public update project_plant_assignments" ON public.project_plant_assignments;
CREATE POLICY "Allow public update project_plant_assignments"
  ON public.project_plant_assignments FOR UPDATE USING (true) WITH CHECK (true);
