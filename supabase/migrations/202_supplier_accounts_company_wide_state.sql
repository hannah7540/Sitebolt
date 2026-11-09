-- Allow Company Wide supplier accounts that operate across all locations.

ALTER TABLE public.supplier_accounts
  DROP CONSTRAINT IF EXISTS supplier_accounts_state_check;

ALTER TABLE public.supplier_accounts
  ADD CONSTRAINT supplier_accounts_state_check
  CHECK (state IN ('ACT', 'NSW', 'NZ', 'WA', 'Company Wide'));

COMMENT ON TABLE public.supplier_accounts IS
  'Trade supplier accounts directory, filtered by state/region (ACT, NSW, NZ, WA, Company Wide).';
