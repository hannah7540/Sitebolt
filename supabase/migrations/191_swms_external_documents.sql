-- External / third-party SWMS documents stored on public.swms
ALTER TABLE public.swms
  ADD COLUMN IF NOT EXISTS is_external boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_company_name text,
  ADD COLUMN IF NOT EXISTS storage_path text;

ALTER TABLE public.swms_documents
  ADD COLUMN IF NOT EXISTS is_external boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_company_name text,
  ADD COLUMN IF NOT EXISTS storage_path text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('swms-documents', 'swms-documents', true)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_swms_is_external
  ON public.swms (is_external)
  WHERE is_external = true;

COMMENT ON COLUMN public.swms.is_external IS
  'True when this SWMS is an uploaded third-party (builder) PDF.';
COMMENT ON COLUMN public.swms.external_company_name IS
  'Builder or company that supplied the external SWMS PDF.';
COMMENT ON COLUMN public.swms.storage_path IS
  'Object key in the swms-documents storage bucket.';
