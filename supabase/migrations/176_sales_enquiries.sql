-- Additive sales lead capture for the public marketing site.
-- Does not alter or drop existing tables.

CREATE TABLE IF NOT EXISTS public.sales_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  company_name text NOT NULL,
  work_email text NOT NULL,
  phone text,
  state text NOT NULL,
  fleet_team_size text,
  modules_of_interest text[] NOT NULL DEFAULT '{}'::text[],
  source_host text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_enquiries_state_check
    CHECK (state IN ('ACT', 'NSW', 'WA', 'NZ'))
);

CREATE INDEX IF NOT EXISTS idx_sales_enquiries_created_at
  ON public.sales_enquiries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_enquiries_work_email
  ON public.sales_enquiries (work_email);

ALTER TABLE public.sales_enquiries ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.sales_enquiries TO service_role;
