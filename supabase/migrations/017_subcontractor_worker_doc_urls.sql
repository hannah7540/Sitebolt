-- Subcontractor worker document URL columns (distinct from legacy photo_url fields)
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS white_card_doc_url text,
  ADD COLUMN IF NOT EXISTS silica_cert_doc_url text;

COMMENT ON COLUMN workers.white_card_doc_url IS 'White card scan/PDF URL for subcontractor onboarding';
COMMENT ON COLUMN workers.silica_cert_doc_url IS 'Silica certificate scan/PDF URL for subcontractor onboarding';
