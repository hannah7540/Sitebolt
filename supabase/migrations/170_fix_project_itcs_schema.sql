-- Ensure pipe_size and service columns exist safely to prevent schema cache errors
ALTER TABLE public.project_itcs
  ADD COLUMN IF NOT EXISTS pipe_size text,
  ADD COLUMN IF NOT EXISTS pipe_material text,
  ADD COLUMN IF NOT EXISTS service text,
  ADD COLUMN IF NOT EXISTS service_type text,
  ADD COLUMN IF NOT EXISTS lines_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS drawing_name text,
  ADD COLUMN IF NOT EXISTS service_run_coordinates jsonb;

ALTER TABLE public.project_itps
  ADD COLUMN IF NOT EXISTS drawing_name text,
  ADD COLUMN IF NOT EXISTS service_run_coordinates jsonb;

NOTIFY pgrst, 'reload schema';
