-- Optional legacy link column on swms_documents
ALTER TABLE swms_documents
  ADD COLUMN IF NOT EXISTS swms_id uuid;

COMMENT ON COLUMN swms_documents.swms_id IS 'Legacy alias linking to public.swms.id';
