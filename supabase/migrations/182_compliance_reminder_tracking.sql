-- Recurring reminder timestamps on existing assignment and document tables.
-- Do not invent new tables: SWMS uses swms_assignments; inductions use
-- form_worker_assignments; VOC uses worker_vocs; driver's licence lives on workers.

ALTER TABLE public.swms_assignments
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;

ALTER TABLE public.form_worker_assignments
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;

ALTER TABLE public.worker_vocs
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS drivers_licence_last_reminded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_swms_assignments_pending_reminded
  ON public.swms_assignments (last_reminded_at, created_at)
  WHERE status = 'Pending';

CREATE INDEX IF NOT EXISTS idx_form_worker_assignments_pending_reminded
  ON public.form_worker_assignments (last_reminded_at, assigned_at)
  WHERE status IN ('pending', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_worker_vocs_expiry_reminded
  ON public.worker_vocs (expiry_date, last_reminded_at);

CREATE INDEX IF NOT EXISTS idx_workers_licence_expiry_reminded
  ON public.workers (drivers_licence_expiry, drivers_licence_last_reminded_at);

COMMENT ON COLUMN public.swms_assignments.last_reminded_at IS
  'Last assignment or 7-day incomplete reminder sent for this SWMS sign-off.';
COMMENT ON COLUMN public.form_worker_assignments.last_reminded_at IS
  'Last assignment or 7-day incomplete reminder sent for this induction.';
COMMENT ON COLUMN public.worker_vocs.last_reminded_at IS
  'Last 30-day/7-day VOC expiry reminder sent to the worker.';
COMMENT ON COLUMN public.workers.drivers_licence_last_reminded_at IS
  'Last 30-day/7-day driver licence expiry reminder sent to the worker.';
