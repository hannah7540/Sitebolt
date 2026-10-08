-- Marketing inquiry form no longer collects State/Region.
-- Keep existing rows; allow new inserts without a state value.
-- Does not alter tenant operational tables.

ALTER TABLE public.sales_enquiries
  DROP CONSTRAINT IF EXISTS sales_enquiries_state_check;

ALTER TABLE public.sales_enquiries
  ALTER COLUMN state DROP NOT NULL;
