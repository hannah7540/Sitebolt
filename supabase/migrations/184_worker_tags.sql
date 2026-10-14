-- Worker tags: organisation-scoped labels + worker assignments.
-- Safe to re-run. Does not mutate A Plus rows.

CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  organisation_id uuid
);

ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS organisation_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS tags_organisation_name_unique
  ON public.tags (organisation_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS idx_tags_organisation_id
  ON public.tags (organisation_id);

CREATE TABLE IF NOT EXISTS public.worker_tags (
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (worker_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_worker_tags_tag_id
  ON public.worker_tags (tag_id);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read tags" ON public.tags;
CREATE POLICY "Allow public read tags"
  ON public.tags FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert tags" ON public.tags;
CREATE POLICY "Allow public insert tags"
  ON public.tags FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update tags" ON public.tags;
CREATE POLICY "Allow public update tags"
  ON public.tags FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete tags" ON public.tags;
CREATE POLICY "Allow public delete tags"
  ON public.tags FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read worker_tags" ON public.worker_tags;
CREATE POLICY "Allow public read worker_tags"
  ON public.worker_tags FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert worker_tags" ON public.worker_tags;
CREATE POLICY "Allow public insert worker_tags"
  ON public.worker_tags FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update worker_tags" ON public.worker_tags;
CREATE POLICY "Allow public update worker_tags"
  ON public.worker_tags FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete worker_tags" ON public.worker_tags;
CREATE POLICY "Allow public delete worker_tags"
  ON public.worker_tags FOR DELETE USING (true);

COMMENT ON TABLE public.tags IS
  'Organisation-scoped worker tags (e.g. NSW Worker).';
COMMENT ON TABLE public.worker_tags IS
  'Many-to-many assignment of tags to workers.';
