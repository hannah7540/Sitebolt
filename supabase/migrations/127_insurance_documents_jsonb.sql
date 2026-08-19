-- Multiple document attachments per insurance policy (backwards-compatible with file_url)

ALTER TABLE company_insurances
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE organisation_insurances
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE company_insurances
SET documents = jsonb_build_array(
  jsonb_build_object(
    'name', COALESCE(NULLIF(trim(file_name), ''), 'Policy document'),
    'url', COALESCE(file_url, document_url),
    'uploaded_at', COALESCE(updated_at, created_at, now())::text
  )
)
WHERE jsonb_array_length(documents) = 0
  AND (file_url IS NOT NULL OR document_url IS NOT NULL);

UPDATE organisation_insurances
SET documents = jsonb_build_array(
  jsonb_build_object(
    'name', COALESCE(NULLIF(trim(file_name), ''), 'Policy document'),
    'url', COALESCE(file_url, document_url),
    'uploaded_at', COALESCE(updated_at, created_at, now())::text
  )
)
WHERE jsonb_array_length(documents) = 0
  AND (file_url IS NOT NULL OR document_url IS NOT NULL);

COMMENT ON COLUMN company_insurances.documents IS
  'Array of { name, url, uploaded_at } policy attachment metadata';

COMMENT ON COLUMN organisation_insurances.documents IS
  'Array of { name, url, uploaded_at } policy attachment metadata';
