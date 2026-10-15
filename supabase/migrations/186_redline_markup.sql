-- Red line markup: field-drawn ITC runs over uploaded PDF drawings.
-- Geometry is stored; the PDF in the private redline-drawings bucket is never edited.
-- Coordinates: every x/y is a 0–1 fraction of page width/height, origin top-left.

CREATE TABLE IF NOT EXISTS public.redline_sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid,
  file_name       text NOT NULL,
  file_size       bigint NOT NULL CHECK (file_size > 0),
  page_count      int NOT NULL CHECK (page_count >= 1),
  storage_path    text NOT NULL UNIQUE,
  drawing_id      uuid,
  drawing_rev     text,
  uploaded_by     uuid NOT NULL,
  uploaded_by_worker_id uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS redline_sources_fingerprint_idx
  ON public.redline_sources (
    organisation_id,
    file_name,
    file_size,
    page_count
  );

CREATE INDEX IF NOT EXISTS redline_sources_org_idx
  ON public.redline_sources (organisation_id);

CREATE TABLE IF NOT EXISTS public.itc_redlines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid,
  itc_id          uuid NOT NULL,
  source_id       uuid NOT NULL REFERENCES public.redline_sources(id) ON DELETE CASCADE,
  page            int  NOT NULL DEFAULT 1 CHECK (page >= 1),
  segs            jsonb NOT NULL,
  width           numeric(8,6) NOT NULL DEFAULT 0.004 CHECK (width BETWEEN 0.0005 AND 0.05),
  opacity         numeric(3,2) NOT NULL DEFAULT 0.40 CHECK (opacity BETWEEN 0.10 AND 1.00),
  label           jsonb,
  source          text NOT NULL DEFAULT 'field' CHECK (source IN ('field', 'office')),
  review          text NOT NULL DEFAULT 'pending' CHECK (review IN ('pending', 'accepted', 'rejected')),
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  review_note     text,
  drawn_by        uuid NOT NULL,
  drawn_by_worker_id uuid,
  drawn_by_name   text,
  drawn_at        timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (itc_id, source_id),
  CONSTRAINT itc_redlines_segs_is_array CHECK (
    jsonb_typeof(segs) = 'array' AND jsonb_array_length(segs) >= 1
  ),
  CONSTRAINT itc_redlines_label_shape CHECK (
    label IS NULL OR (
      jsonb_typeof(label) = 'object'
      AND label ? 'x' AND label ? 'y' AND label ? 'size'
    )
  )
);

CREATE INDEX IF NOT EXISTS itc_redlines_itc_idx ON public.itc_redlines (itc_id);
CREATE INDEX IF NOT EXISTS itc_redlines_source_idx ON public.itc_redlines (source_id);
CREATE INDEX IF NOT EXISTS itc_redlines_review_idx ON public.itc_redlines (review);
CREATE INDEX IF NOT EXISTS itc_redlines_org_idx ON public.itc_redlines (organisation_id);

CREATE OR REPLACE FUNCTION public.touch_itc_redlines_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS itc_redlines_touch ON public.itc_redlines;
CREATE TRIGGER itc_redlines_touch
  BEFORE UPDATE ON public.itc_redlines
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_itc_redlines_updated_at();

ALTER TABLE public.redline_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itc_redlines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read redline sources" ON public.redline_sources;
CREATE POLICY "read redline sources" ON public.redline_sources
  FOR SELECT TO authenticated
  USING (
    organisation_id IS NULL
    OR public.sitebolt_can_access_organisation(organisation_id)
  );

DROP POLICY IF EXISTS "upload redline source" ON public.redline_sources;
CREATE POLICY "upload redline source" ON public.redline_sources
  FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

DROP POLICY IF EXISTS "admin manages redline sources" ON public.redline_sources;
CREATE POLICY "admin manages redline sources" ON public.redline_sources
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workers w
      WHERE w.auth_user_id = auth.uid()
        AND lower(coalesce(w.security_role, '')) IN (
          'owner', 'full_access', 'super_admin', 'admin_access', 'master_admin'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workers w
      WHERE w.auth_user_id = auth.uid()
        AND lower(coalesce(w.security_role, '')) IN (
          'owner', 'full_access', 'super_admin', 'admin_access', 'master_admin'
        )
    )
  );

DROP POLICY IF EXISTS "read redlines" ON public.itc_redlines;
CREATE POLICY "read redlines" ON public.itc_redlines
  FOR SELECT TO authenticated
  USING (
    organisation_id IS NULL
    OR public.sitebolt_can_access_organisation(organisation_id)
  );

DROP POLICY IF EXISTS "draw redline" ON public.itc_redlines;
CREATE POLICY "draw redline" ON public.itc_redlines
  FOR INSERT TO authenticated
  WITH CHECK (
    drawn_by = auth.uid()
    AND review = 'pending'
  );

DROP POLICY IF EXISTS "edit own pending redline" ON public.itc_redlines;
CREATE POLICY "edit own pending redline" ON public.itc_redlines
  FOR UPDATE TO authenticated
  USING (drawn_by = auth.uid() AND review = 'pending')
  WITH CHECK (drawn_by = auth.uid() AND review = 'pending');

DROP POLICY IF EXISTS "leader reviews redline" ON public.itc_redlines;
CREATE POLICY "leader reviews redline" ON public.itc_redlines
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workers w
      WHERE w.auth_user_id = auth.uid()
        AND lower(coalesce(w.security_role, '')) IN (
          'owner', 'full_access', 'super_admin', 'admin_access',
          'master_admin', 'project_team'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workers w
      WHERE w.auth_user_id = auth.uid()
        AND lower(coalesce(w.security_role, '')) IN (
          'owner', 'full_access', 'super_admin', 'admin_access',
          'master_admin', 'project_team'
        )
    )
  );

DROP POLICY IF EXISTS "delete own pending redline" ON public.itc_redlines;
CREATE POLICY "delete own pending redline" ON public.itc_redlines
  FOR DELETE TO authenticated
  USING (drawn_by = auth.uid() AND review = 'pending');

DROP POLICY IF EXISTS "admin deletes redline" ON public.itc_redlines;
CREATE POLICY "admin deletes redline" ON public.itc_redlines
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workers w
      WHERE w.auth_user_id = auth.uid()
        AND lower(coalesce(w.security_role, '')) IN (
          'owner', 'full_access', 'super_admin', 'admin_access', 'master_admin'
        )
    )
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('redline-drawings', 'redline-drawings', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "read redline drawings" ON storage.objects;
CREATE POLICY "read redline drawings" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'redline-drawings');

DROP POLICY IF EXISTS "upload redline drawings" ON storage.objects;
CREATE POLICY "upload redline drawings" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'redline-drawings');

DROP POLICY IF EXISTS "delete own redline drawings" ON storage.objects;
CREATE POLICY "delete own redline drawings" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'redline-drawings');

NOTIFY pgrst, 'reload schema';
