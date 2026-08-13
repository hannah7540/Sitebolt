-- User profiles, platform roles (owner / super_admin), and permission mapping.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  role text NOT NULL DEFAULT 'general_worker',
  worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'general_worker',
  ADD COLUMN IF NOT EXISTS worker_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (
    role IN (
      'owner',
      'super_admin',
      'full_access',
      'admin_access',
      'general_worker'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_lower
  ON profiles (lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_worker_id ON profiles(worker_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workers_auth_user_id
  ON workers(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_security_role_check;
ALTER TABLE workers
  ADD CONSTRAINT workers_security_role_check
  CHECK (
    security_role IS NULL OR security_role IN (
      'owner',
      'super_admin',
      'full_access',
      'admin_access',
      'general_worker'
    )
  );

CREATE TABLE IF NOT EXISTS role_permissions (
  role text PRIMARY KEY,
  unrestricted_read boolean NOT NULL DEFAULT false,
  unrestricted_write boolean NOT NULL DEFAULT false,
  manage_security boolean NOT NULL DEFAULT false,
  view_financials boolean NOT NULL DEFAULT false,
  access_admin_console boolean NOT NULL DEFAULT false,
  access_accounts boolean NOT NULL DEFAULT false,
  manage_accounts boolean NOT NULL DEFAULT false
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
  ('owner', true, true, true, true, true, true, true),
  ('super_admin', true, true, true, true, true, true, true),
  ('full_access', false, false, true, true, true, true, true),
  ('admin_access', false, false, false, false, true, true, false),
  ('general_worker', false, false, false, false, false, false, false)
ON CONFLICT (role) DO UPDATE SET
  unrestricted_read = EXCLUDED.unrestricted_read,
  unrestricted_write = EXCLUDED.unrestricted_write,
  manage_security = EXCLUDED.manage_security,
  view_financials = EXCLUDED.view_financials,
  access_admin_console = EXCLUDED.access_admin_console,
  access_accounts = EXCLUDED.access_accounts,
  manage_accounts = EXCLUDED.manage_accounts;

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role
  FROM profiles p
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.has_unrestricted_platform_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT rp.unrestricted_read AND rp.unrestricted_write
      FROM profiles p
      JOIN role_permissions rp ON rp.role = p.role
      WHERE p.id = auth.uid()
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
    (
      SELECT rp.manage_security
      FROM profiles p
      JOIN role_permissions rp ON rp.role = p.role
      WHERE p.id = auth.uid()
    ),
    false
  );
$$;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles read own or unrestricted" ON profiles;
CREATE POLICY "Profiles read own or unrestricted"
  ON profiles FOR SELECT
  USING (
    auth.uid() = id
    OR public.has_unrestricted_platform_access()
  );

DROP POLICY IF EXISTS "Profiles update own or unrestricted" ON profiles;
CREATE POLICY "Profiles update own or unrestricted"
  ON profiles FOR UPDATE
  USING (
    auth.uid() = id
    OR public.has_unrestricted_platform_access()
  )
  WITH CHECK (
    auth.uid() = id
    OR public.has_unrestricted_platform_access()
  );

DROP POLICY IF EXISTS "Profiles insert unrestricted" ON profiles;
CREATE POLICY "Profiles insert unrestricted"
  ON profiles FOR INSERT
  WITH CHECK (
    auth.uid() = id
    OR public.has_unrestricted_platform_access()
  );

DROP POLICY IF EXISTS "Profiles service bootstrap" ON profiles;
CREATE POLICY "Profiles service bootstrap"
  ON profiles FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Role permissions read all" ON role_permissions;
CREATE POLICY "Role permissions read all"
  ON role_permissions FOR SELECT
  USING (true);

COMMENT ON TABLE profiles IS 'Supabase Auth user profile with platform role and optional linked worker row.';
COMMENT ON TABLE role_permissions IS 'Permission matrix for profiles.role and workers.security_role values.';
COMMENT ON FUNCTION public.has_unrestricted_platform_access IS
  'True when the signed-in profile role is owner or super_admin (unrestricted read/write).';

NOTIFY pgrst, 'reload schema';
