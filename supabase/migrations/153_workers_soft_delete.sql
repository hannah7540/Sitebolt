-- Soft-delete workers while retaining historical compliance records.
-- Safe to re-run.

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_workers_deleted_at
  ON public.workers (deleted_at)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.workers.deleted_at IS
  'Set when a worker is soft-deleted. Day-to-day lists exclude rows where this is not null.';

NOTIFY pgrst, 'reload schema';
