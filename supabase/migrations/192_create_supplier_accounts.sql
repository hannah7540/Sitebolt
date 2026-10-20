-- Matches the supplier_accounts table created in the Supabase dashboard.
-- Introspected from the remote schema (no organisation_id column).
-- Safe to re-run. Does not seed data, drop dashboard RLS, or mutate A Plus rows.

CREATE TABLE IF NOT EXISTS public.supplier_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  description text,
  state text NOT NULL,
  credit_limit numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_accounts
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
    WHERE conname = 'supplier_accounts_state_check'
      AND conrelid = 'public.supplier_accounts'::regclass
  ) THEN
    ALTER TABLE public.supplier_accounts
      ADD CONSTRAINT supplier_accounts_state_check
      CHECK (state IN ('WA', 'NZ', 'ACT', 'NSW'));
  END IF;
END $$;

ALTER TABLE public.supplier_accounts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_accounts TO authenticated;
GRANT ALL ON public.supplier_accounts TO service_role;

COMMENT ON TABLE public.supplier_accounts IS
  'Trade supplier accounts directory, filtered by state/region (WA, NZ, ACT, NSW).';
