-- Four-tier RBAC tables + workers.security_role constraint.
-- Safe to re-run. Does not create or query public.profiles.
-- All staff identity and security_role live on public.workers.
-- Paste this entire file into the Supabase SQL Editor and run it.

CREATE TABLE IF NOT EXISTS public.roles (
  role text PRIMARY KEY,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL REFERENCES public.roles(role) ON DELETE CASCADE,
  resource text NOT NULL,
  can_read boolean NOT NULL DEFAULT false,
  can_write boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, resource)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role
  ON public.role_permissions (role);
CREATE INDEX IF NOT EXISTS idx_role_permissions_resource
  ON public.role_permissions (resource);

COMMENT ON TABLE public.roles IS
  'Canonical 4-tier security roles: general_worker, project_team, full_access, master_admin.';
COMMENT ON TABLE public.role_permissions IS
  'Per-role, per-module read/write matrix keyed by workers.security_role.';

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Roles read all" ON public.roles;
CREATE POLICY "Roles read all"
  ON public.roles FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Role permissions read all" ON public.role_permissions;
CREATE POLICY "Role permissions read all"
  ON public.role_permissions FOR SELECT
  USING (true);

INSERT INTO public.roles (role, label, description, sort_order)
VALUES
  (
    'general_worker',
    'General Worker',
    'Worker dashboard and My Profile only.',
    10
  ),
  (
    'project_team',
    'Project Team',
    'Projects, Administration, Communication, Subcontractors, operational Organisation modules, and timesheet entry only.',
    20
  ),
  (
    'full_access',
    'Full Access',
    'Entire website for the active organisation, including billing and payroll.',
    30
  ),
  (
    'master_admin',
    'Master Admin',
    'Unrestricted system-wide access. Cross-company selection stays email-based.',
    40
  ),
  (
    'owner',
    'Master Admin (legacy)',
    'Legacy alias for master_admin on workers.security_role.',
    41
  ),
  (
    'super_admin',
    'Master Admin (legacy)',
    'Legacy alias for master_admin on workers.security_role.',
    42
  )
ON CONFLICT (role) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

INSERT INTO public.role_permissions (role, resource, can_read, can_write)
VALUES
  ('general_worker', 'worker_dashboard', true, true),
  ('general_worker', 'projects', false, false),
  ('general_worker', 'administration', false, false),
  ('general_worker', 'communication', false, false),
  ('general_worker', 'subcontractors', false, false),
  ('general_worker', 'organisation_ops', false, false),
  ('general_worker', 'organisation_settings', false, false),
  ('general_worker', 'security_settings', false, false),
  ('general_worker', 'accounts_timesheet_entry', false, false),
  ('general_worker', 'accounts_payroll', false, false),
  ('general_worker', 'financials', false, false),
  ('general_worker', 'unrestricted', false, false),

  ('project_team', 'worker_dashboard', true, true),
  ('project_team', 'projects', true, true),
  ('project_team', 'administration', true, true),
  ('project_team', 'communication', true, true),
  ('project_team', 'subcontractors', true, true),
  ('project_team', 'organisation_ops', true, true),
  ('project_team', 'organisation_settings', false, false),
  ('project_team', 'security_settings', true, true),
  ('project_team', 'accounts_timesheet_entry', true, true),
  ('project_team', 'accounts_payroll', false, false),
  ('project_team', 'financials', false, false),
  ('project_team', 'unrestricted', false, false),

  ('full_access', 'worker_dashboard', true, true),
  ('full_access', 'projects', true, true),
  ('full_access', 'administration', true, true),
  ('full_access', 'communication', true, true),
  ('full_access', 'subcontractors', true, true),
  ('full_access', 'organisation_ops', true, true),
  ('full_access', 'organisation_settings', true, true),
  ('full_access', 'security_settings', true, true),
  ('full_access', 'accounts_timesheet_entry', true, true),
  ('full_access', 'accounts_payroll', true, true),
  ('full_access', 'financials', true, true),
  ('full_access', 'unrestricted', false, false),

  ('master_admin', 'worker_dashboard', true, true),
  ('master_admin', 'projects', true, true),
  ('master_admin', 'administration', true, true),
  ('master_admin', 'communication', true, true),
  ('master_admin', 'subcontractors', true, true),
  ('master_admin', 'organisation_ops', true, true),
  ('master_admin', 'organisation_settings', true, true),
  ('master_admin', 'security_settings', true, true),
  ('master_admin', 'accounts_timesheet_entry', true, true),
  ('master_admin', 'accounts_payroll', true, true),
  ('master_admin', 'financials', true, true),
  ('master_admin', 'unrestricted', true, true),

  ('owner', 'worker_dashboard', true, true),
  ('owner', 'projects', true, true),
  ('owner', 'administration', true, true),
  ('owner', 'communication', true, true),
  ('owner', 'subcontractors', true, true),
  ('owner', 'organisation_ops', true, true),
  ('owner', 'organisation_settings', true, true),
  ('owner', 'security_settings', true, true),
  ('owner', 'accounts_timesheet_entry', true, true),
  ('owner', 'accounts_payroll', true, true),
  ('owner', 'financials', true, true),
  ('owner', 'unrestricted', true, true),

  ('super_admin', 'worker_dashboard', true, true),
  ('super_admin', 'projects', true, true),
  ('super_admin', 'administration', true, true),
  ('super_admin', 'communication', true, true),
  ('super_admin', 'subcontractors', true, true),
  ('super_admin', 'organisation_ops', true, true),
  ('super_admin', 'organisation_settings', true, true),
  ('super_admin', 'security_settings', true, true),
  ('super_admin', 'accounts_timesheet_entry', true, true),
  ('super_admin', 'accounts_payroll', true, true),
  ('super_admin', 'financials', true, true),
  ('super_admin', 'unrestricted', true, true)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = EXCLUDED.can_read,
  can_write = EXCLUDED.can_write;

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS security_role text DEFAULT 'general_worker';

CREATE OR REPLACE FUNCTION public.current_worker_security_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.security_role
  FROM public.workers w
  WHERE w.auth_user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_worker_security_role();
$$;

CREATE OR REPLACE FUNCTION public.has_unrestricted_platform_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM public.workers w
      JOIN public.role_permissions rp
        ON rp.role = w.security_role
       AND rp.resource = 'unrestricted'
      WHERE w.auth_user_id = auth.uid()
        AND rp.can_read
        AND rp.can_write
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.profile_can_manage_security()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM public.workers w
      JOIN public.role_permissions rp
        ON rp.role = w.security_role
       AND rp.resource = 'security_settings'
      WHERE w.auth_user_id = auth.uid()
        AND rp.can_write
    ),
    false
  );
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

  IF EXISTS (
    SELECT 1
    FROM public.workers w
    WHERE w.auth_user_id = auth.uid()
      AND COALESCE(w.security_role, 'general_worker') IN (
        'master_admin',
        'full_access',
        'owner',
        'super_admin'
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

UPDATE public.workers
SET security_role = 'project_team'
WHERE security_role IN ('project_super_admin', 'project_admin', 'admin_access');

UPDATE public.workers
SET security_role = 'master_admin'
WHERE security_role IN ('owner', 'super_admin');

UPDATE public.workers
SET security_role = 'general_worker'
WHERE security_role IS NULL OR btrim(security_role) = '';

ALTER TABLE public.workers
  ALTER COLUMN security_role SET DEFAULT 'general_worker';

ALTER TABLE public.workers DROP CONSTRAINT IF EXISTS workers_security_role_check;
ALTER TABLE public.workers
  ADD CONSTRAINT workers_security_role_check
  CHECK (
    security_role IS NULL OR security_role IN (
      'general_worker',
      'project_team',
      'full_access',
      'master_admin'
    )
  );

COMMENT ON FUNCTION public.current_worker_security_role IS
  'Signed-in workers.security_role for auth.uid().';
COMMENT ON FUNCTION public.current_profile_role IS
  'Compatibility alias — returns workers.security_role, never queries public.profiles.';
COMMENT ON FUNCTION public.is_platform_admin IS
  'True for master_admin / full_access (and legacy owner / super_admin) on workers.security_role.';
COMMENT ON FUNCTION public.has_unrestricted_platform_access IS
  'True when workers.security_role has unrestricted read+write in role_permissions.';

NOTIFY pgrst, 'reload schema';
