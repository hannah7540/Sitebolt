-- Regional trade supplier accounts directory.
-- Organisation-scoped. Safe to re-run. Does not seed or mutate A Plus rows.

CREATE TABLE IF NOT EXISTS public.supplier_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid,
  name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  description text,
  state text NOT NULL,
  credit_limit numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_accounts_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT supplier_accounts_state_check CHECK (state IN ('WA', 'NZ', 'ACT', 'NSW'))
);

ALTER TABLE public.supplier_accounts
  ADD COLUMN IF NOT EXISTS organisation_id uuid,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS credit_limit numeric,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'supplier_accounts_name_not_blank'
      AND conrelid = 'public.supplier_accounts'::regclass
  ) THEN
    ALTER TABLE public.supplier_accounts
      ADD CONSTRAINT supplier_accounts_name_not_blank CHECK (btrim(name) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'supplier_accounts_state_check'
      AND conrelid = 'public.supplier_accounts'::regclass
  ) THEN
    ALTER TABLE public.supplier_accounts
      ADD CONSTRAINT supplier_accounts_state_check CHECK (state IN ('WA', 'NZ', 'ACT', 'NSW'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_supplier_accounts_organisation_id
  ON public.supplier_accounts (organisation_id);

CREATE INDEX IF NOT EXISTS idx_supplier_accounts_org_state
  ON public.supplier_accounts (organisation_id, state);

ALTER TABLE public.supplier_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_accounts_select_org ON public.supplier_accounts;
CREATE POLICY supplier_accounts_select_org
  ON public.supplier_accounts
  FOR SELECT
  TO authenticated
  USING (public.sitebolt_can_access_organisation(organisation_id));

DROP POLICY IF EXISTS supplier_accounts_insert_org ON public.supplier_accounts;
CREATE POLICY supplier_accounts_insert_org
  ON public.supplier_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.sitebolt_can_access_organisation(organisation_id));

DROP POLICY IF EXISTS supplier_accounts_update_org ON public.supplier_accounts;
CREATE POLICY supplier_accounts_update_org
  ON public.supplier_accounts
  FOR UPDATE
  TO authenticated
  USING (public.sitebolt_can_access_organisation(organisation_id))
  WITH CHECK (public.sitebolt_can_access_organisation(organisation_id));

DROP POLICY IF EXISTS supplier_accounts_delete_org ON public.supplier_accounts;
CREATE POLICY supplier_accounts_delete_org
  ON public.supplier_accounts
  FOR DELETE
  TO authenticated
  USING (public.sitebolt_can_access_organisation(organisation_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_accounts TO authenticated;
GRANT ALL ON public.supplier_accounts TO service_role;

COMMENT ON TABLE public.supplier_accounts IS
  'Organisation-scoped trade supplier accounts, filtered by state/region (WA, NZ, ACT, NSW).';

NOTIFY pgrst, 'reload schema';
