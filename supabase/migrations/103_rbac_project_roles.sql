-- RBAC: project_super_admin / project_admin roles; migrate legacy admin_access.
-- Safe to re-run.

UPDATE workers
SET security_role = 'project_super_admin'
WHERE security_role = 'admin_access';

UPDATE profiles
SET role = 'project_super_admin'
WHERE role = 'admin_access';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (
    role IN (
      'owner',
      'super_admin',
      'full_access',
      'project_super_admin',
      'project_admin',
      'general_worker'
    )
  );

ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_security_role_check;
ALTER TABLE workers
  ADD CONSTRAINT workers_security_role_check
  CHECK (
    security_role IS NULL OR security_role IN (
      'owner',
      'super_admin',
      'full_access',
      'project_super_admin',
      'project_admin',
      'general_worker'
    )
  );

INSERT INTO role_permissions (
  role,
  unrestricted_read,
  unrestricted_write,
  manage_security,
  view_financials,
  access_admin_console,
  access_accounts,
  manage_accounts
) VALUES
  ('project_super_admin', false, false, false, false, true, false, false),
  ('project_admin', false, false, false, false, true, false, false)
ON CONFLICT (role) DO UPDATE SET
  unrestricted_read = EXCLUDED.unrestricted_read,
  unrestricted_write = EXCLUDED.unrestricted_write,
  manage_security = EXCLUDED.manage_security,
  view_financials = EXCLUDED.view_financials,
  access_admin_console = EXCLUDED.access_admin_console,
  access_accounts = EXCLUDED.access_accounts,
  manage_accounts = EXCLUDED.manage_accounts;

UPDATE role_permissions SET
  unrestricted_read = true,
  unrestricted_write = false,
  manage_security = false,
  view_financials = false,
  access_admin_console = true,
  access_accounts = true,
  manage_accounts = false
WHERE role = 'super_admin';

DELETE FROM role_permissions WHERE role = 'admin_access';

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

  IF public.current_profile_role() IN ('full_access', 'project_super_admin') THEN
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
        'project_super_admin'
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.is_platform_admin IS
  'True for owner, super_admin, full_access, and project_super_admin roles.';

NOTIFY pgrst, 'reload schema';
