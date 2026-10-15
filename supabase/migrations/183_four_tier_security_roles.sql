-- Four-tier worker security roles:
-- general_worker, project_team, full_access, master_admin
-- Safe to re-run. Does not change Master Admin email / company-switcher logic.

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

INSERT INTO public.role_permissions (
  role,
  unrestricted_read,
  unrestricted_write,
  manage_security,
  view_financials,
  access_admin_console,
  access_accounts,
  manage_accounts
) VALUES
  ('project_team', false, false, true, false, true, true, false),
  ('master_admin', true, true, true, true, true, true, true)
ON CONFLICT (role) DO UPDATE SET
  unrestricted_read = EXCLUDED.unrestricted_read,
  unrestricted_write = EXCLUDED.unrestricted_write,
  manage_security = EXCLUDED.manage_security,
  view_financials = EXCLUDED.view_financials,
  access_admin_console = EXCLUDED.access_admin_console,
  access_accounts = EXCLUDED.access_accounts,
  manage_accounts = EXCLUDED.manage_accounts;

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

  IF public.current_profile_role() IN ('full_access', 'master_admin', 'owner', 'super_admin') THEN
    RETURN true;
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

COMMENT ON FUNCTION public.is_platform_admin IS
  'True for master_admin / full_access (and legacy owner / super_admin) roles.';

NOTIFY pgrst, 'reload schema';
