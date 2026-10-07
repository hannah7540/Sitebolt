-- Public marketing custom-build inquiries may come from any AU state/territory or NZ.
-- Does not alter worker, project, pay-rule, or tenant operational tables.

ALTER TABLE public.sales_enquiries
  DROP CONSTRAINT IF EXISTS sales_enquiries_state_check;

ALTER TABLE public.sales_enquiries
  ADD CONSTRAINT sales_enquiries_state_check
  CHECK (state IN ('ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA', 'NZ'));
