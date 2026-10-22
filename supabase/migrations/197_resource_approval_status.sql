-- Pending admin approval for subcontractor worker/plant project assignments.
-- Legacy internal rows keep approval_status NULL and remain visible on calendars.

CREATE TABLE IF NOT EXISTS public.project_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  worker_id uuid NOT NULL,
  subcontractor_id uuid,
  organisation_id uuid,
  approval_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS project_workers_project_worker_unique
  ON public.project_workers (project_id, worker_id);

CREATE INDEX IF NOT EXISTS idx_project_workers_approval_status
  ON public.project_workers (approval_status);

ALTER TABLE public.project_workers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.project_worker_assignments
  ADD COLUMN IF NOT EXISTS approval_status text;

ALTER TABLE public.project_plant_assignments
  ADD COLUMN IF NOT EXISTS approval_status text;

ALTER TABLE public.plant
  ADD COLUMN IF NOT EXISTS approval_status text;

ALTER TABLE public.plant
  ADD COLUMN IF NOT EXISTS pending_project_id uuid;

ALTER TABLE public.plant_equipment
  ADD COLUMN IF NOT EXISTS approval_status text;

ALTER TABLE public.plant_equipment
  ADD COLUMN IF NOT EXISTS pending_project_id uuid;

ALTER TABLE public.subcontractor_plant
  ADD COLUMN IF NOT EXISTS approval_status text;

ALTER TABLE public.subcontractor_plant
  ADD COLUMN IF NOT EXISTS pending_project_id uuid;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS subcontractor_id uuid;

NOTIFY pgrst, 'reload schema';
