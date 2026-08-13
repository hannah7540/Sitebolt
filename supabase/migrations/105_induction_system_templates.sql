-- Mark seeded standard induction templates and support stable upsert on reset.

ALTER TABLE induction_form_templates
  ADD COLUMN IF NOT EXISTS is_system_template boolean NOT NULL DEFAULT false;

ALTER TABLE induction_form_templates
  ADD COLUMN IF NOT EXISTS system_template_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_induction_form_templates_system_key
  ON induction_form_templates (system_template_key)
  WHERE system_template_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_induction_form_templates_is_system
  ON induction_form_templates (is_system_template)
  WHERE is_system_template = true;

COMMENT ON COLUMN induction_form_templates.is_system_template IS
  'True for standard templates re-seeded after db:reset; users may still edit in the UI.';
COMMENT ON COLUMN induction_form_templates.system_template_key IS
  'Stable slug used to upsert standard templates (e.g. nsw-company-induction).';
