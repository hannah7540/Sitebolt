-- doc_url alias on swms_documents (parallel to file_url)
ALTER TABLE swms_documents
  ADD COLUMN IF NOT EXISTS doc_url text;

COMMENT ON COLUMN swms_documents.doc_url IS 'Legacy alias for file_url';
