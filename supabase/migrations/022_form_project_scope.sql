-- Optional site_id alias for legacy/new form submissions (mirrors project_id UUID)
ALTER TABLE site_forms
  ADD COLUMN IF NOT EXISTS site_id text;

ALTER TABLE plant_prestarts
  ADD COLUMN IF NOT EXISTS site_id text;

COMMENT ON COLUMN site_forms.site_id IS 'Legacy alias for project_id on site safety forms';
COMMENT ON COLUMN plant_prestarts.site_id IS 'Legacy alias for project_id on plant pre-starts';
