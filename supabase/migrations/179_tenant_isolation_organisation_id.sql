-- Tenant isolation: add organisation_id to safety/onboarding tables.
-- Does NOT backfill, UPDATE, or DELETE existing A Plus rows.
-- Does NOT SET NOT NULL while legacy A Plus NULL organisation_id rows remain.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'swms',
    'swms_documents',
    'swms_assignments',
    'swms_sign_offs',
    'induction_form_templates',
    'form_worker_assignments',
    'inductions',
    'induction_records',
    'worker_inductions',
    'safety_briefs',
    'itp_records',
    'site_forms',
    'timesheets',
    'worker_timesheets'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = t
        AND column_name = 'organisation_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN organisation_id uuid', t);
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_organisation_id ON public.%I (organisation_id)',
        t,
        t
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.sitebolt_can_access_organisation(row_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN auth.uid() IS NULL THEN false
      WHEN EXISTS (
        SELECT 1
        FROM public.workers w
        WHERE w.auth_user_id = auth.uid()
          AND lower(coalesce(w.security_role, '')) IN (
            'owner',
            'full_access',
            'super_admin',
            'admin_access'
          )
      ) THEN true
      WHEN row_org IS NULL
        OR row_org = '00000000-0000-0000-0000-000000000001'::uuid THEN EXISTS (
        SELECT 1
        FROM public.workers w
        WHERE w.auth_user_id = auth.uid()
          AND (
            w.organisation_id IS NULL
            OR w.organisation_id = '00000000-0000-0000-0000-000000000001'::uuid
          )
      )
      ELSE EXISTS (
        SELECT 1
        FROM public.workers w
        WHERE w.auth_user_id = auth.uid()
          AND w.organisation_id = row_org
      )
    END;
$$;

REVOKE ALL ON FUNCTION public.sitebolt_can_access_organisation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sitebolt_can_access_organisation(uuid) TO authenticated, anon, service_role;

-- Induction tables used public USING (true) SELECT/ALL policies, which leaked
-- A Plus templates and pending sign-offs into Demo. SWMS public SELECT is kept
-- for unauthenticated token signing links; list endpoints are application-scoped.

DROP POLICY IF EXISTS "Allow public read induction_form_templates" ON public.induction_form_templates;
DROP POLICY IF EXISTS "Allow public write induction_form_templates" ON public.induction_form_templates;
DROP POLICY IF EXISTS "induction_form_templates_tenant_select_isolation" ON public.induction_form_templates;
DROP POLICY IF EXISTS "induction_form_templates_tenant_write_isolation" ON public.induction_form_templates;

ALTER TABLE public.induction_form_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "induction_form_templates_tenant_select_isolation"
  ON public.induction_form_templates
  FOR SELECT
  USING (public.sitebolt_can_access_organisation(organisation_id));

CREATE POLICY "induction_form_templates_tenant_write_isolation"
  ON public.induction_form_templates
  FOR ALL
  USING (public.sitebolt_can_access_organisation(organisation_id))
  WITH CHECK (public.sitebolt_can_access_organisation(organisation_id));

DROP POLICY IF EXISTS "Allow public read form_worker_assignments" ON public.form_worker_assignments;
DROP POLICY IF EXISTS "Allow public write form_worker_assignments" ON public.form_worker_assignments;
DROP POLICY IF EXISTS "form_worker_assignments_tenant_select_isolation" ON public.form_worker_assignments;
DROP POLICY IF EXISTS "form_worker_assignments_tenant_write_isolation" ON public.form_worker_assignments;

ALTER TABLE public.form_worker_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "form_worker_assignments_tenant_select_isolation"
  ON public.form_worker_assignments
  FOR SELECT
  USING (public.sitebolt_can_access_organisation(organisation_id));

CREATE POLICY "form_worker_assignments_tenant_write_isolation"
  ON public.form_worker_assignments
  FOR ALL
  USING (public.sitebolt_can_access_organisation(organisation_id))
  WITH CHECK (public.sitebolt_can_access_organisation(organisation_id));
