-- Hired labour workers live in public.workers (calendar + scheduling)
-- with a category flag and a dedicated onboarding checklist.
-- Existing internal rows keep worker_category = 'internal'.

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS worker_category varchar NOT NULL DEFAULT 'internal';

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS white_card_provided boolean NOT NULL DEFAULT false;

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS silica_cert_provided boolean NOT NULL DEFAULT false;

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS emergency_contact_name text;

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS emergency_contact_number text;

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship text;

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

UPDATE public.workers
SET worker_category = 'internal'
WHERE worker_category IS NULL OR btrim(worker_category) = '';

CREATE INDEX IF NOT EXISTS idx_workers_worker_category
  ON public.workers (organisation_id, worker_category)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.workers.worker_category IS
  'internal | hired_labour — hired labour are scheduled like staff but excluded from timesheets and pay rules.';
