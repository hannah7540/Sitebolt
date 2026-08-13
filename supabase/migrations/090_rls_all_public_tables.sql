-- Enable Row-Level Security on every public table and replace permissive anon policies
-- with role-aware admin + worker scoped access.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Auth helper functions (extends migration 089)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.role FROM profiles p WHERE p.id = auth.uid()),
    (SELECT w.security_role FROM workers w WHERE w.auth_user_id = auth.uid() LIMIT 1),
    'general_worker'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_worker_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.worker_id FROM profiles p WHERE p.id = auth.uid()),
    (SELECT w.id FROM workers w WHERE w.auth_user_id = auth.uid() LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_authenticated_user()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT auth.uid() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_unrestricted_platform_access() THEN
    RETURN true;
  END IF;

  IF public.current_profile_role() IN ('full_access', 'admin_access') THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM workers w
    WHERE w.auth_user_id = auth.uid()
      AND COALESCE(w.security_role, 'general_worker') IN (
        'owner',
        'super_admin',
        'full_access',
        'admin_access'
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.worker_can_access_project(p_project_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin()
    OR (
      public.current_worker_id() IS NOT NULL
      AND NULLIF(trim(p_project_id), '') IS NOT NULL
      AND (
        EXISTS (
          SELECT 1
          FROM workers w
          WHERE w.id = public.current_worker_id()
            AND (
              w.assigned_project_id = p_project_id
              OR p_project_id = ANY(COALESCE(w.assigned_project_ids, '{}'::text[]))
            )
        )
        OR EXISTS (
          SELECT 1
          FROM project_worker_assignments pwa
          WHERE pwa.worker_id = public.current_worker_id()
            AND pwa.project_id = p_project_id
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.worker_shares_project_with(p_other_worker_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_worker_id() IS NOT NULL
    AND p_other_worker_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM project_worker_assignments mine
        JOIN project_worker_assignments theirs
          ON mine.project_id = theirs.project_id
        WHERE mine.worker_id = public.current_worker_id()
          AND theirs.worker_id = p_other_worker_id
      )
      OR EXISTS (
        SELECT 1
        FROM workers me
        JOIN workers other ON other.id = p_other_worker_id
        WHERE me.id = public.current_worker_id()
          AND (
            (
              me.assigned_project_id IS NOT NULL
              AND me.assigned_project_id = other.assigned_project_id
            )
            OR (
              COALESCE(me.assigned_project_ids, '{}'::text[])
              && COALESCE(other.assigned_project_ids, '{}'::text[])
            )
          )
      )
    );
$$;

COMMENT ON FUNCTION public.is_platform_admin IS
  'True for owner, super_admin, full_access, and admin_access roles.';
COMMENT ON FUNCTION public.current_worker_id IS
  'Linked worker row for the signed-in auth user (profiles.worker_id or workers.auth_user_id).';
COMMENT ON FUNCTION public.worker_can_access_project IS
  'True when the signed-in worker is assigned to the given project id.';

-- ---------------------------------------------------------------------------
-- 2. Enable RLS on every public table (including workers/plant if missing)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tbl record;
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      tbl.tablename
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Remove legacy permissive anon policies
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname NOT LIKE 'Profiles %'
      AND policyname NOT LIKE 'Role permissions %'
      AND (
        policyname LIKE 'Allow public%'
        OR policyname LIKE 'Public %'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      pol.policyname,
      pol.tablename
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Platform admin full access on all public tables (except profiles matrix)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tbl record;
  skip_tables constant text[] := ARRAY['profiles', 'role_permissions'];
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND NOT (tablename = ANY (skip_tables))
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'Platform admin full access',
      tbl.tablename
    );
    EXECUTE format(
      $policy$
      CREATE POLICY "Platform admin full access"
        ON public.%1$I
        FOR ALL
        USING (public.is_platform_admin())
        WITH CHECK (public.is_platform_admin())
      $policy$,
      tbl.tablename
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Worker-scoped policies (signed-in workers; admins covered above)
-- ---------------------------------------------------------------------------

-- workers: own profile + roster on shared projects
DROP POLICY IF EXISTS "Workers read own and project roster" ON workers;
CREATE POLICY "Workers read own and project roster"
  ON workers FOR SELECT
  USING (
    public.current_worker_id() IS NOT NULL
    AND (
      id = public.current_worker_id()
      OR public.worker_shares_project_with(id)
    )
  );

DROP POLICY IF EXISTS "Workers update own profile" ON workers;
CREATE POLICY "Workers update own profile"
  ON workers FOR UPDATE
  USING (id = public.current_worker_id())
  WITH CHECK (id = public.current_worker_id());

-- worker_timesheets
DROP POLICY IF EXISTS "Workers manage own timesheets" ON worker_timesheets;
CREATE POLICY "Workers manage own timesheets"
  ON worker_timesheets FOR ALL
  USING (worker_id = public.current_worker_id())
  WITH CHECK (worker_id = public.current_worker_id());

-- worker_vocs
DROP POLICY IF EXISTS "Workers manage own vocs" ON worker_vocs;
CREATE POLICY "Workers manage own vocs"
  ON worker_vocs FOR ALL
  USING (worker_id = public.current_worker_id())
  WITH CHECK (worker_id = public.current_worker_id());

-- leave_requests
DROP POLICY IF EXISTS "Workers manage own leave requests" ON leave_requests;
CREATE POLICY "Workers manage own leave requests"
  ON leave_requests FOR ALL
  USING (worker_id = public.current_worker_id())
  WITH CHECK (worker_id = public.current_worker_id());

-- worker_schedule
DROP POLICY IF EXISTS "Workers read own schedule" ON worker_schedule;
CREATE POLICY "Workers read own schedule"
  ON worker_schedule FOR SELECT
  USING (worker_id = public.current_worker_id());

-- worker_calendar_events
DROP POLICY IF EXISTS "Workers manage own calendar events" ON worker_calendar_events;
CREATE POLICY "Workers manage own calendar events"
  ON worker_calendar_events FOR ALL
  USING (worker_id = public.current_worker_id())
  WITH CHECK (worker_id = public.current_worker_id());

-- site_forms: own submissions + assigned project visibility
DROP POLICY IF EXISTS "Workers read assigned site forms" ON site_forms;
CREATE POLICY "Workers read assigned site forms"
  ON site_forms FOR SELECT
  USING (
    worker_id = public.current_worker_id()
    OR public.worker_can_access_project(project_id)
  );

DROP POLICY IF EXISTS "Workers submit site forms" ON site_forms;
CREATE POLICY "Workers submit site forms"
  ON site_forms FOR INSERT
  WITH CHECK (
    worker_id = public.current_worker_id()
    AND public.worker_can_access_project(project_id)
  );

-- induction / form assignments
DROP POLICY IF EXISTS "Workers read public form templates" ON induction_form_templates;
CREATE POLICY "Workers read public form templates"
  ON induction_form_templates FOR SELECT
  USING (public.is_authenticated_user());

DROP POLICY IF EXISTS "Workers manage own form assignments" ON form_worker_assignments;
CREATE POLICY "Workers manage own form assignments"
  ON form_worker_assignments FOR ALL
  USING (worker_id = public.current_worker_id())
  WITH CHECK (worker_id = public.current_worker_id());

-- projects: read assigned projects
DROP POLICY IF EXISTS "Workers read assigned projects" ON projects;
CREATE POLICY "Workers read assigned projects"
  ON projects FOR SELECT
  USING (
    public.current_worker_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM workers w
        WHERE w.id = public.current_worker_id()
          AND (
            w.assigned_project_id = projects.id::text
            OR w.assigned_project_id = projects.slug
            OR projects.id::text = ANY(COALESCE(w.assigned_project_ids, '{}'::text[]))
            OR projects.slug = ANY(COALESCE(w.assigned_project_ids, '{}'::text[]))
          )
      )
      OR EXISTS (
        SELECT 1
        FROM project_worker_assignments pwa
        WHERE pwa.worker_id = public.current_worker_id()
          AND (
            pwa.project_id = projects.id::text
            OR pwa.project_id = projects.slug
          )
      )
    )
  );

-- project assignments (read own)
DROP POLICY IF EXISTS "Workers read own project assignments" ON project_worker_assignments;
CREATE POLICY "Workers read own project assignments"
  ON project_worker_assignments FOR SELECT
  USING (worker_id = public.current_worker_id());

-- plant / prestarts (read for authenticated workers on site)
DROP POLICY IF EXISTS "Workers read plant fleet" ON plant;
CREATE POLICY "Workers read plant fleet"
  ON plant FOR SELECT
  USING (public.is_authenticated_user());

DROP POLICY IF EXISTS "Workers read plant prestarts" ON plant_prestarts;
CREATE POLICY "Workers read plant prestarts"
  ON plant_prestarts FOR SELECT
  USING (public.is_authenticated_user());

DROP POLICY IF EXISTS "Workers submit plant prestarts" ON plant_prestarts;
CREATE POLICY "Workers submit plant prestarts"
  ON plant_prestarts FOR INSERT
  WITH CHECK (
    public.is_authenticated_user()
    AND (
      operator_worker_id IS NULL
      OR operator_worker_id = public.current_worker_id()
    )
  );

-- timesheet reference data
DROP POLICY IF EXISTS "Workers read timesheet projects" ON timesheet_projects;
CREATE POLICY "Workers read timesheet projects"
  ON timesheet_projects FOR SELECT
  USING (public.is_authenticated_user());

DROP POLICY IF EXISTS "Workers read timesheet tasks" ON timesheet_tasks;
CREATE POLICY "Workers read timesheet tasks"
  ON timesheet_tasks FOR SELECT
  USING (public.is_authenticated_user());

-- SWMS signing workflow
DROP POLICY IF EXISTS "Workers read assigned swms documents" ON swms_documents;
CREATE POLICY "Workers read assigned swms documents"
  ON swms_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM swms_assignments sa
      WHERE sa.swms_id = swms_documents.id
        AND sa.assignee_type = 'worker'
        AND sa.assignee_id = public.current_worker_id()
    )
  );

DROP POLICY IF EXISTS "Workers manage own swms assignments" ON swms_assignments;
CREATE POLICY "Workers manage own swms assignments"
  ON swms_assignments FOR ALL
  USING (
    assignee_type = 'worker'
    AND assignee_id = public.current_worker_id()
  )
  WITH CHECK (
    assignee_type = 'worker'
    AND assignee_id = public.current_worker_id()
  );

DROP POLICY IF EXISTS "Workers read legacy swms" ON swms;
CREATE POLICY "Workers read legacy swms"
  ON swms FOR SELECT
  USING (public.is_authenticated_user());

-- RFIs
DROP POLICY IF EXISTS "Workers manage own rfis" ON rfis;
CREATE POLICY "Workers manage own rfis"
  ON rfis FOR ALL
  USING (
    requested_by_id = public.current_worker_id()
    OR assigned_to_id = public.current_worker_id()
  )
  WITH CHECK (requested_by_id = public.current_worker_id());

-- worker_requests
DROP POLICY IF EXISTS "Workers manage own requests" ON worker_requests;
CREATE POLICY "Workers manage own requests"
  ON worker_requests FOR ALL
  USING (worker_id = public.current_worker_id())
  WITH CHECK (worker_id = public.current_worker_id());

-- dashboard layouts (user_id stores worker id in my_profile scope)
DROP POLICY IF EXISTS "Workers manage own dashboard layouts" ON dashboard_layouts;
CREATE POLICY "Workers manage own dashboard layouts"
  ON dashboard_layouts FOR ALL
  USING (
    public.current_worker_id() IS NOT NULL
    AND user_id = public.current_worker_id()::text
  )
  WITH CHECK (
    public.current_worker_id() IS NOT NULL
    AND user_id = public.current_worker_id()::text
  );

NOTIFY pgrst, 'reload schema';
