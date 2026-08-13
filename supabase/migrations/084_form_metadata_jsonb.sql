-- SiteBolt: Generic form_metadata JSONB for overflow / schema-drift fields

ALTER TABLE site_forms
  ADD COLUMN IF NOT EXISTS form_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE worker_requests
  ADD COLUMN IF NOT EXISTS form_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE plant_prestarts
  ADD COLUMN IF NOT EXISTS form_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE rfis
  ADD COLUMN IF NOT EXISTS form_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS form_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE worker_timesheets
  ADD COLUMN IF NOT EXISTS form_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN site_forms.form_metadata IS
  'Overflow JSONB for optional or schema-drift form fields not mapped to top-level columns.';
