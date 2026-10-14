-- Optional account-holder name on the existing workers onboarding financial columns.
-- Safe to re-run. Does not mutate A Plus rows.

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS bank_account_name text;

COMMENT ON COLUMN public.workers.bank_account_name IS
  'Name on the worker bank account. Institution name remains workers.bank_name.';
