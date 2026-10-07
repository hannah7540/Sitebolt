-- Additive notes / enquiry type for custom-build discovery briefs.
-- Does not alter tenant operational tables.

ALTER TABLE public.sales_enquiries
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.sales_enquiries
  ADD COLUMN IF NOT EXISTS enquiry_type text NOT NULL DEFAULT 'general';
