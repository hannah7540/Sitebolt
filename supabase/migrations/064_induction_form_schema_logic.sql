-- Add schema_fields and logic_rules columns for induction form JSON editor

ALTER TABLE induction_form_templates
  ADD COLUMN IF NOT EXISTS schema_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE induction_form_templates
  ADD COLUMN IF NOT EXISTS logic_rules jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill schema_fields from legacy blocks column
UPDATE induction_form_templates
SET schema_fields = blocks
WHERE schema_fields = '[]'::jsonb
  AND blocks IS NOT NULL
  AND blocks <> '[]'::jsonb;

COMMENT ON COLUMN induction_form_templates.schema_fields IS 'Visual form field definitions (synced with blocks)';
COMMENT ON COLUMN induction_form_templates.logic_rules IS 'Conditional show/hide/mandatory rules as JSON array';
