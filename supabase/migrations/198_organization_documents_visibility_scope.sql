-- Visibility scoping for organisation documents (company-wide vs state-specific).

ALTER TABLE organization_documents
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'company_wide';

ALTER TABLE organization_documents
  ADD COLUMN IF NOT EXISTS state text;

COMMENT ON COLUMN organization_documents.scope IS
  'company_wide = all workers; state_specific = only workers in organization_documents.state';

COMMENT ON COLUMN organization_documents.state IS
  'Australian state code when scope is state_specific (NSW, QLD, VIC, ACT, WA, SA, TAS, NT).';

NOTIFY pgrst, 'reload schema';
