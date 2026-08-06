-- issue_date alias on SWMS document tables
ALTER TABLE swms_documents
  ADD COLUMN IF NOT EXISTS issue_date date;

ALTER TABLE swms_documents
  ADD COLUMN IF NOT EXISTS date date;

ALTER TABLE swms
  ADD COLUMN IF NOT EXISTS issue_date date;

COMMENT ON COLUMN swms_documents.issue_date IS 'Legacy alias for document_date';
COMMENT ON COLUMN swms_documents.date IS 'Legacy alias for document_date';
COMMENT ON COLUMN swms.issue_date IS 'Legacy alias for document_date';
