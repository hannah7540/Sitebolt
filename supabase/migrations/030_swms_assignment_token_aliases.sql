-- Legacy signing token aliases on SWMS assignments
ALTER TABLE swms_assignments
  ADD COLUMN IF NOT EXISTS token text;

ALTER TABLE swms_assignments
  ADD COLUMN IF NOT EXISTS signature_token text;

COMMENT ON COLUMN swms_assignments.token IS 'Legacy alias for signing_token';
COMMENT ON COLUMN swms_assignments.signature_token IS 'Legacy alias for signing_token';
