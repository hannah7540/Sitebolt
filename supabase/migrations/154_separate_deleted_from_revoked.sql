-- Keep soft-deleted workers distinct from temporarily revoked workers.
-- Safe to re-run.

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Rows that already have a deletion timestamp must not keep a revoked status.
UPDATE public.workers
SET status = 'deleted'
WHERE deleted_at IS NOT NULL
  AND lower(coalesce(status, '')) <> 'deleted';

-- Rows already marked deleted should always have deleted_at populated.
UPDATE public.workers
SET deleted_at = coalesce(deleted_at, now())
WHERE lower(coalesce(status, '')) = 'deleted'
  AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workers_deleted_at
  ON public.workers (deleted_at)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.workers.deleted_at IS
  'Set when a worker is permanently archived. Revoked workers keep deleted_at null and status = Revoked.';

NOTIFY pgrst, 'reload schema';
