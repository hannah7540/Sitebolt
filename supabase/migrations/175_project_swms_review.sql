-- Project-scoped SWMS periodic review cycle.
-- One responsible worker per project. Dual-signed audit records.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.project_swms_review_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL UNIQUE,
  responsible_worker_id text NOT NULL,
  frequency_days integer NOT NULL DEFAULT 31,
  last_reviewed_at timestamptz,
  next_review_due timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_swms_review_schedules_due
  ON public.project_swms_review_schedules(next_review_due);

CREATE TABLE IF NOT EXISTS public.project_swms_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  review_date date NOT NULL DEFAULT CURRENT_DATE,
  reviewing_manager_id text NOT NULL,
  consulted_worker_id text NOT NULL,
  reviewing_manager_signature text NOT NULL,
  consulted_worker_signature text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_swms_reviews_project
  ON public.project_swms_reviews(project_id, created_at DESC);

ALTER TABLE public.project_swms_review_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_swms_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read project_swms_review_schedules" ON public.project_swms_review_schedules;
CREATE POLICY "Allow public read project_swms_review_schedules"
  ON public.project_swms_review_schedules FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write project_swms_review_schedules" ON public.project_swms_review_schedules;
CREATE POLICY "Allow public write project_swms_review_schedules"
  ON public.project_swms_review_schedules FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read project_swms_reviews" ON public.project_swms_reviews;
CREATE POLICY "Allow public read project_swms_reviews"
  ON public.project_swms_reviews FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write project_swms_reviews" ON public.project_swms_reviews;
CREATE POLICY "Allow public write project_swms_reviews"
  ON public.project_swms_reviews FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
