-- Organisation insurance policy region coverage (ACT, NSW, WA, NZ only)

ALTER TABLE company_insurances
  ADD COLUMN IF NOT EXISTS states text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS all_states boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN company_insurances.states IS 'Selected regions: ACT, NSW, WA, NZ';
COMMENT ON COLUMN company_insurances.all_states IS 'True when policy applies to all supported regions';
